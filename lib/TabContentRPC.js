'use strict';
const JSONBird = require('jsonbird');

const log = require('./logger')({hostname: 'background', MODULE: 'TabContentRPC'});

const NOOP = () => {};

class TabContentRPC {
    constructor({browserRuntime, browserTabs, context, onRpcInitialize = NOOP}) {
        if (typeof context !== 'string' || !context) {
            throw Error('Invalid `context` argument');
        }

        this.browserRuntime = browserRuntime;
        this.browserTabs = browserTabs;
        this.rpcContext = String(context);
        this.onRpcInitialize = onRpcInitialize;
        this.rpcByTabBrowserId = new Map(); // browserTabId => JSONBird
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

        for (const rpc of this.rpcByTabBrowserId.values()) {
            rpc.removeAllListeners('data');
        }
        this.rpcByTabBrowserId.clear();
    }

    handleRuntimeMessage(object, messageSender) {
        try {
            const {id, tab, frameId} = messageSender;
            if (id !== 'openrunner@computest.nl' ||
                !tab ||
                frameId // 0 = top level
            ) {
                return; // different extension or not from a tab
            }

            if (!object || object.rpcContext !== this.rpcContext) {
                return; // incorrect context (e.g. scratchpad rpc vs runner-module rpc)
            }

            const {id: browserTabId} = tab;
            const rpc = this.get(browserTabId);
            rpc.write(object);
        }
        catch (err) {
            log.error({err, messageSender}, 'Error during browser.runtime.onMessage');
        }
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        const oldRpc = this.rpcByTabBrowserId.get(browserTabId);
        if (oldRpc) {
            oldRpc.removeAllListeners('data');
        }

        this.rpcByTabBrowserId.delete(browserTabId);
    }

    /**
     * Create a new RPC instance for the given tab, and detach any previous RPC instance for this tab.
     * Note that using this method is optional, this object will create RPC instances as needed.
     *
     * @param {*} browserTabId
     * @return {JSONBird}
     */
    reinitialize(browserTabId) {
        const oldRpc = this.rpcByTabBrowserId.get(browserTabId);
        if (oldRpc) {
            oldRpc.removeAllListeners('data');
        }

        const {rpcContext} = this;
        const rpc = new JSONBird({
            readableMode: 'object',
            writableMode: 'object',
            receiveErrorStack: true,
            sendErrorStack: true,
            defaultTimeout: 15003,
            pingMethod: 'ping',
        });
        rpc.on('data', object => {
            const message = Object.assign({rpcContext}, object);
            this.browserTabs.sendMessage(browserTabId, message);
        });
        rpc.on('error', err => log.error({browserTabId, err}, 'Uncaught error in tab content RPC'));
        rpc.on('protocolError', err => log.error({browserTabId, err}, 'Protocol error in tab content RPC'));

        this.rpcByTabBrowserId.set(browserTabId, rpc);
        this.onRpcInitialize({browserTabId, rpc});
        return rpc;
    }

    /**
     * Get (or create) an RPC instance for the given tab.
     * @param {*} browserTabId
     * @return {JSONBird}
     */
    get(browserTabId) {
        return this.rpcByTabBrowserId.get(browserTabId) || this.reinitialize(browserTabId);
    }
}

module.exports = TabContentRPC;
