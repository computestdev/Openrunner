'use strict';
const {WebSocketClient, closeCodes} = require('jsonbird-websocket');
const {generate: generateShortId} = require('shortid');

const URL = require('../../../lib/URL');
const URLSearchParams = require('../../../lib/URLSearchParams');

const websocketCnCUrl = ({host, port, instanceId, runtimeVersions}) => {
    const url = new URL('ws://localhost');
    url.hostname = host;
    url.port = port;
    url.pathname = '/openrunner-cnc';
    url.search = new URLSearchParams(Object.assign({instanceId}, runtimeVersions));
    return String(url);
};

class CnCClient {
    constructor({host, port, runtimeVersions}) {
        this.instanceId = generateShortId();
        this.rpc = new WebSocketClient({
            url: websocketCnCUrl({host, port, runtimeVersions, instanceId: this.instanceId}),
            jsonbird: {
                defaultTimeout: 10000,
                receiveErrorStack: true,
                sendErrorStack: true,
            },
        });

        /* eslint-disable no-console */
        // Note: the normal logger is not used in this class because this logger will send its
        // messages to the server using this CnCClient. Which will not work if the client is suffering
        // from problems, and it can also cause feedback loops
        this.rpc.on('error', err => console.error('RPC Error', err.message, err));
        this.rpc.on('protocolError', err => console.warn('RPC Protocol error', err.message, err));
        this.rpc.on('webSocketConnecting', () => console.info('Opening WebSocket connection...'));
        this.rpc.on('webSocketOpen', () => console.info('WebSocket is now open'));
        this.rpc.on('webSocketError', event => console.error('WebSocket error!', event));
        this.rpc.on('webSocketClose', closeInfo => console.warn('WebSocket has been closed', closeInfo));
        this.rpc.on('webSocketClose', ({code}) => {
            if (code === closeCodes.POLICY_VIOLATION) {
                console.warn('Stopping because the server sent use a policy violation close code', code);
                // do not reconnect for a policy violation, which is used to indicate that we have opened too many connections
                this.stop();
            }
        });
        /* eslint-enable no-console */

        Object.seal(this);
    }

    async call(...args) {
        return this.rpc.call(...args);
    }

    notify(...args) {
        return this.rpc.notify(...args);
    }

    methods(methods) {
        this.rpc.methods(methods);
    }

    method(name, func) {
        this.rpc.method(name, func);
    }

    start() {
        this.rpc.start();
    }

    stop() {
        this.rpc.stop();
    }
}

module.exports = CnCClient;
