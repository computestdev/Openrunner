'use strict';
const JSONBird = require('jsonbird');

const log = require('./logger')({hostname: 'content', MODULE: 'ContentRPC'});

class ContentRPC {
    constructor({browserRuntime, context}) {
        if (typeof context !== 'string' || !context) {
            throw Error('Invalid `context` argument');
        }

        this.browserRuntime = browserRuntime;
        this.rpcContext = String(context);
        this.rpc = new JSONBird({
            readableMode: 'object',
            writableMode: 'object',
            receiveErrorStack: true,
            sendErrorStack: true,
            defaultTimeout: 15004,
            pingMethod: 'ping',
        });
        this.handleRuntimeMessage = this.handleRuntimeMessage.bind(this);
        Object.freeze(this);
    }

    attach() {
        const {rpcContext} = this;
        this.browserRuntime.onMessage.addListener(this.handleRuntimeMessage);
        this.rpc.on('data', object => {
            const message = Object.assign({rpcContext}, object);
            this.browserRuntime.sendMessage('openrunner@computest.nl', message, {});
        });
        this.rpc.on('error', err => log.error({err}, 'Uncaught error in tab content RPC'));
        this.rpc.on('protocolError', err => log.error({err}, 'Protocol error in tab content RPC'));
    }

    detach() {
        this.browserRuntime.onMessage.removeListener(this.handleRuntimeMessage);
        this.rpc.removeAllListeners('data');
    }

    handleRuntimeMessage(object, messageSender) {
        try {
            if (messageSender.id !== 'openrunner@computest.nl' || messageSender.tab) {
                return; // different extension or the message came from a content script (instead of the background script)
            }

            if (!object || object.rpcContext !== this.rpcContext) {
                return; // incorrect context (e.g. scratchpad rpc vs runner-module rpc)
            }

            this.rpc.write(object);
        }
        catch (err) {
            log.error({err, messageSender}, 'Error during browser.runtime.onMessage');
        }
    }

    async call(...args) {
        return this.rpc.call(...args);
    }

    methods(methods) {
        this.rpc.methods(methods);
    }

    method(name, func) {
        this.rpc.method(name, func);
    }

    async notify(...args) {
        return this.rpc.notify(...args);
    }

    notifications(methods) {
        this.rpc.notifications(methods);
    }

    notification(name, func) {
        this.rpc.notification(name, func);
    }
}

module.exports = ContentRPC;
