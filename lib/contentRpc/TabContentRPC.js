'use strict';
const MethodRegistrations = require('./MethodRegistrations');
const asyncTimeout = require('../asyncTimeout');
const errorToObject = require('../errorToObject');
const createRpcRequestError = require('./createRpcRequestError');
const log = require('../logger')({hostname: 'background', MODULE: 'TabContentRPC'});
const {CONTENT_RPC_TIMEOUT_ERROR} = require('../scriptErrors');

const DEFAULT_CALL_TIMEOUT = 15003;
const NOOP = () => {};
const promiseTry = async fn => fn();

class TabContentRPCTab {
    constructor(browserTabId, browserFrameId, tabContentRPC) {
        this.browserTabId = browserTabId;
        this.browserFrameId = browserFrameId;
        this._methods = new MethodRegistrations();
        this._tabContentRPC = tabContentRPC;
        this._destroyed = false;
        this._initializePromise = null;
        Object.seal(this);
    }

    _destroy() {
        this._destroyed = true;
        Object.freeze(this);
    }

    async _handle(message) {
        /* istanbul ignore if */ // this should not happen... The browser sent us a message for a tab that has been closed
        if (this._destroyed) {
            throw Error('TabContentRPCTab#_handle(): This instance has been destroyed (the tab has been closed)');
        }

        return Promise.resolve()
        .then(() => this._methods.call(message.method, ...message.params))
        .then(result => ({result}))
        .catch(err => ({error: errorToObject(err)}));
    }

    /**
     * Call the given remote method by name, (previously registered by the content script)
     * @param {string|Object} nameOrOptions The method name or an options object
     * @param {string} nameOrOptions.name The method name
     * @param {number} nameOrOptions.timeout A maximum time (in milliseconds) to wait for a response. The returned promise will reject
     *        after this time.
     * @param {...*} params
     * @return {*} The resolved value returned by the remote method.
     */
    async call(nameOrOptions, ...params) {
        if ((typeof nameOrOptions !== 'string' && typeof nameOrOptions !== 'object') || nameOrOptions === null) {
            throw Error('TabContentRPCTab#call(): First argument must be a string or an object with at least a "name" property');
        }

        const name = typeof nameOrOptions === 'object' ? nameOrOptions.name : nameOrOptions;
        if (typeof name !== 'string') {
            throw Error('TabContentRPCTab#call(): First argument must be a string or an object with at least a "name" property');
        }
        const timeout = typeof nameOrOptions === 'object' && 'timeout' in nameOrOptions
            ? nameOrOptions.timeout :
            DEFAULT_CALL_TIMEOUT;

        if (this._destroyed) {
            throw Error('TabContentRPCTab#call(): This instance has been destroyed (the tab has been closed)');
        }

        const message = {
            rpcContext: this._tabContentRPC.rpcContext,
            method: name,
            params,
        };

        // (A nice function name which we can easily recognise in stack traces)
        const tabContentRPCTab$call$sendMessage = async () => this._tabContentRPC.browserTabs.sendMessage(
            this.browserTabId,
            message,
            {frameId: this.browserFrameId}
        );

        const response = await asyncTimeout(
            tabContentRPCTab$call$sendMessage,
            {
                timeout,
                timeoutErrorName: CONTENT_RPC_TIMEOUT_ERROR,
                timeoutMessage: `TabContentRPC: Remote Call "${name}" timed out after ${timeout}ms`,
            }
        )();

        if (!response) {
            // This could happen because:
            // 1. The content script really did not return anything
            // 2. The message was just sent to the content script, however the frame is in the process of navigating somewhere else (or
            //    getting removed) and our content script has been unloaded.
            const err = Error(`TabContentRPC: Remote Call "${name}" did not receive a response from the content script`);
            err.name = 'RPCNoResponse';
            throw err;
        }

        if ('error' in response) {
            throw createRpcRequestError(response.error);
        }
        return response.result;
    }

    /**
     * Performs `this.call()`, however this method does not wait for the call to be fulfilled.
     * Any return value is ignored and rejections are logged.
     *
     * @param {string|Object} nameOrOptions
     * @param {string} nameOrOptions.name
     * @param {number} nameOrOptions.timeout
     * @param {...*} params
     */
    callAndForget(nameOrOptions, ...params) {
        this.call(nameOrOptions, ...params)
        .catch(err => log.error({err, methodName: nameOrOptions}, 'callAndForget: The remote method rejected with an error'));
    }

    methods(methods) {
        this._methods.registerAll(methods);
    }

    method(name, func) {
        this._methods.register(name, func);
    }
}

class TabContentRPC {
    constructor({browserRuntime, browserTabs, context, onRpcInitialize = NOOP}) {
        if (typeof context !== 'string' || !context) {
            throw Error('Invalid `context` argument');
        }

        this.browserRuntime = browserRuntime;
        this.browserTabs = browserTabs;
        this.rpcContext = String(context);
        this.onRpcInitialize = onRpcInitialize;
        this.rpcMap = new Map(); // Map<browserTabId, Map<browserFrameId, TabContentRPCTab>>
        this.handleRuntimeMessage = this.handleRuntimeMessage.bind(this);
        this.handleTabsRemoved = this.handleTabsRemoved.bind(this);
        Object.freeze(this);
    }

    attach() {
        this.browserRuntime.onMessage.addListener(this.handleRuntimeMessage);
        this.browserTabs.onRemoved.addListener(this.handleTabsRemoved);
    }

    detach() {
        this.browserRuntime.onMessage.removeListener(this.handleRuntimeMessage);
        this.browserTabs.onRemoved.removeListener(this.handleTabsRemoved);

        for (const browserTabId of this.rpcMap.keys()) {
            this._cleanupTab(browserTabId);
        }
        this.rpcMap.clear();
    }

    _cleanupTab(browserTabId) {
        const frameMap = this.rpcMap.get(browserTabId);
        this.rpcMap.delete(browserTabId);

        if (frameMap) {
            for (const rpc of frameMap.values()) {
                rpc._destroy();
            }
            frameMap.clear();
        }
    }

    handleRuntimeMessage(message, messageSender) {
        const {id, tab, frameId: browserFrameId} = messageSender;
        if (id !== 'openrunner@computest.nl' || // different extension
            !tab || // not from a tab
            !message ||
            message.rpcContext !== this.rpcContext // incorrect context (e.g. scratchpad rpc vs runner-module rpc)
        ) {
            // note: if we return a promise here, we might override the return value of an other handler!
            // This is why this method can not be made `async`
            return undefined;
        }

        const {id: browserTabId} = tab;
        const rpc = this.get(browserTabId, browserFrameId);
        return rpc._initializePromise.then(() => rpc._handle(message));
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        this._cleanupTab(browserTabId);
        // Note: there is no equivalent frame removed event. we will leak a little bit of memory if the page keeps removing & adding frames.
        // This will probably not be an issue for our use case.
    }

    /**
     * Create a new RPC instance for the given tab and frame, and detach any previous RPC instance for this tab.
     * Note that using this method is optional, get() will create RPC instances as needed.
     *
     * @param {*} browserTabId
     * @param {*} browserFrameId 0 for the top level frame; > 0 for iframe/object/etc
     * @return {TabContentRPCTab}
     */
    reinitialize(browserTabId, browserFrameId) {
        if (!this.rpcMap.has(browserTabId)) {
            this.rpcMap.set(browserTabId, new Map());
        }
        const frameMap = this.rpcMap.get(browserTabId);

        {
            const rpc = frameMap.get(browserFrameId);
            rpc && rpc._destroy();
        }

        const rpc = new TabContentRPCTab(browserTabId, browserFrameId, this);
        this.rpcMap.get(browserTabId).set(browserFrameId, rpc);
        rpc._initializePromise = promiseTry(() => this.onRpcInitialize({browserTabId, browserFrameId, rpc}))
        .catch(err => log.error({err}, 'Error while calling onRpcInitialize'))
        .then(() => undefined);
        return rpc;
    }

    /**
     * Get (or create) an RPC instance for the given tab.
     * @param {*} browserTabId
     * @param {*} browserFrameId 0 for the top level frame (TOP_LEVEL_FRAME_ID); > 0 for iframe/object/etc
     * @return {TabContentRPCTab}
     */
    get(browserTabId, browserFrameId) {
        const frameMap = this.rpcMap.get(browserTabId);
        if (frameMap) {
            const rpc = frameMap.get(browserFrameId);
            if (rpc) {
                return rpc;
            }
        }
        return this.reinitialize(browserTabId, browserFrameId);
    }
}

TabContentRPC.TOP_LEVEL_FRAME_ID = 0;

module.exports = TabContentRPC;
