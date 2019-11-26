'use strict';
const MethodRegistrations = require('./MethodRegistrations');
const asyncTimeout = require('../asyncTimeout');
const errorToObject = require('../errorToObject');
const createRpcRequestError = require('./createRpcRequestError');
const log = require('../logger')({hostname: 'background', MODULE: 'TabContentRPC'});
const {CONTENT_RPC_TIMEOUT_ERROR} = require('../scriptErrors');

const DEFAULT_CALL_TIMEOUT = 15003;
const NOOP = () => {};
const TRUE = () => true;
const promiseTry = async fn => fn();

class TabContentRPCFrameInstance {
    constructor(browserTabId, browserFrameId, contentToken, tabContentRPC) {
        this.browserTabId = browserTabId;
        this.browserFrameId = browserFrameId;
        this.contentToken = contentToken;
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
            throw Error('TabContentRPCFrameInstance#_handle(): This instance has been destroyed');
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
            throw Error('TabContentRPCFrameInstance#call(): First argument must be a string or an object with at least a "name" property');
        }

        const name = typeof nameOrOptions === 'object' ? nameOrOptions.name : nameOrOptions;
        if (typeof name !== 'string') {
            throw Error('TabContentRPCFrameInstance#call(): First argument must be a string or an object with at least a "name" property');
        }
        const timeout = typeof nameOrOptions === 'object' && 'timeout' in nameOrOptions
            ? nameOrOptions.timeout :
            DEFAULT_CALL_TIMEOUT;

        if (this._destroyed) {
            throw Error('TabContentRPCFrameInstance#call(): This instance has been destroyed');
        }

        const message = {
            rpcContext: this._tabContentRPC.rpcContext,
            method: name,
            params,
        };

        if (this.contentToken) {
            message.rpcContentToken = this.contentToken;
        }

        // (A nice function name which we can easily recognise in stack traces)
        const TabContentRPCFrameInstance$call$sendMessage = async () => {
            try {
                return await this._tabContentRPC.browserTabs.sendMessage(
                    this.browserTabId,
                    message,
                    {frameId: this.browserFrameId},
                );
            }
            catch (err) {
                // note: errors thrown by the RPC method itself do not end up here, instead they end up in a "rejected" property
                // this way we can differentiate between errors raised by WebExt and our own RPC methods
                if (err.message === 'Could not establish connection. Receiving end does not exist.') {
                    // This could happen because:
                    // 1. The content script really did not attach a listener
                    // 2. The message was just sent to the content script, however the frame was in the process of navigating somewhere else
                    // and our content script on the next frame has not been loaded yet
                    const newError = Error(
                        `TabContentRPC: Remote Call "${name}" did not receive a response from the content script ` +
                        '(there are no listeners)',
                    );
                    newError.name = 'RPCNoResponse';
                    newError.cause = err;
                    throw newError;
                }

                throw err;
            }
        };

        const response = await asyncTimeout(
            TabContentRPCFrameInstance$call$sendMessage,
            {
                timeout,
                timeoutErrorName: CONTENT_RPC_TIMEOUT_ERROR,
                timeoutMessage: `TabContentRPC: Remote Call "${name}" timed out after ${timeout}ms`,
            },
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
    constructor({browserRuntime, browserTabs, context, onRpcInitialize = NOOP, filterSender = TRUE}) {
        if (typeof context !== 'string' || !context) {
            throw Error('Invalid `context` argument');
        }

        this.browserRuntime = browserRuntime;
        this.browserTabs = browserTabs;
        this.rpcContext = String(context);
        this.filterSender = filterSender;
        this.onRpcInitialize = onRpcInitialize;
        this.rpcMap = new Map(); // Map<browserTabId, Map<browserFrameId, Map<contentToken, TabContentRPCFrameInstance>>>
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
            this.destroyAllFrames(browserTabId);
        }
        this.rpcMap.clear();
    }

    handleRuntimeMessage(message, messageSender) {
        const {id, tab, frameId: browserFrameId} = messageSender;
        if (id !== 'openrunner@computest.nl' || // different extension
            !tab || // not from a tab
            !message ||
            message.rpcContext !== this.rpcContext || // incorrect context (e.g. scratchpad rpc vs runner-module rpc)
            !this.filterSender(tab, browserFrameId)
        ) {
            // note: if we return a promise here, we might override the return value of an other handler!
            // This is why this method can not be made `async`
            return undefined;
        }

        const {id: browserTabId} = tab;
        const rpc = this.get(browserTabId, browserFrameId, message.rpcContentToken || null);
        return rpc._initializePromise.then(() => rpc._handle(message));
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        this.destroyAllFrames(browserTabId);
        // Note: there is no equivalent frame removed event. we will leak a little bit of memory if the page keeps removing & adding frames.
        // This will probably not be an issue for our use case.
    }

    destroyAllFrames(browserTabId) {
        const frameMap = this.rpcMap.get(browserTabId);
        if (!frameMap) {
            return;
        }

        const browserFrameIds = [...frameMap.keys()];
        for (const browserFrameId of browserFrameIds) {
            this.destroyAllInstances(browserTabId, browserFrameId);
        }
    }

    destroyAllInstances(browserTabId, browserFrameId) {
        const frameMap = this.rpcMap.get(browserTabId);
        const instanceMap = frameMap && frameMap.get(browserFrameId);
        if (!instanceMap) {
            return;
        }

        frameMap.delete(browserFrameId);
        if (!frameMap.size) {
            this.rpcMap.delete(browserTabId);
        }

        for (const rpc of instanceMap.values()) {
            rpc._destroy();
        }
    }

    /**
     * Create a new RPC instance for the given tab and frame, and detach any previous RPC instance for this tab.
     * Note that using this method is optional, get() will create RPC instances as needed.
     *
     * @param {*} browserTabId
     * @param {*} browserFrameId 0 for the top level frame; > 0 for iframe/object/etc
     * @param {string|null} contentToken
     * @return {TabContentRPCFrameInstance}
     */
    reinitialize(browserTabId, browserFrameId, contentToken = null) {
        if (!this.rpcMap.has(browserTabId)) {
            this.rpcMap.set(browserTabId, new Map());
        }
        const frameMap = this.rpcMap.get(browserTabId);
        if (!frameMap.has(browserFrameId)) {
            frameMap.set(browserFrameId, new Map());
        }
        const instanceMap = frameMap.get(browserFrameId);

        {
            const rpc = instanceMap.get(contentToken);
            if (rpc) {
                rpc._destroy();
                instanceMap.delete(contentToken);
            }
        }

        const rpc = new TabContentRPCFrameInstance(browserTabId, browserFrameId, contentToken, this);
        instanceMap.set(contentToken, rpc);

        rpc._initializePromise = promiseTry(() => this.onRpcInitialize({browserTabId, browserFrameId, contentToken, rpc}))
        .catch(err => log.error({err, browserTabId, browserFrameId, contentToken}, 'Error while calling onRpcInitialize'))
        .then(() => undefined);
        return rpc;
    }

    /**
     * Get (or create) an RPC instance for the given tab.
     * @param {string|number} browserTabId
     * @param {string|number} browserFrameId 0 for the top level frame (TOP_LEVEL_FRAME_ID); > 0 for iframe/object/etc
     * @param {string|null} contentToken
     * @return {TabContentRPCFrameInstance}
     */
    get(browserTabId, browserFrameId, contentToken = null) {
        const frameMap = this.rpcMap.get(browserTabId);
        const instanceMap = frameMap && frameMap.get(browserFrameId);
        const rpc = instanceMap && instanceMap.get(contentToken);

        if (rpc) {
            return rpc;
        }

        return this.reinitialize(browserTabId, browserFrameId, contentToken);
    }
}

TabContentRPC.TOP_LEVEL_FRAME_ID = 0;

module.exports = TabContentRPC;
