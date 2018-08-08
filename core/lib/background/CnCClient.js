'use strict';
const {WebSocketClient, closeCodes} = require('jsonbird-websocket');
const {generate: generateShortId} = require('shortid');

const URL = require('../../../lib/URL');
const URLSearchParams = require('../../../lib/URLSearchParams');
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'background/CnCClient'});

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

        this.rpc.on('error', err => log.error({err}, 'RPC Error'));
        this.rpc.on('protocolError', err => log.warn({err}, 'RPC Protocol error'));
        this.rpc.on('webSocketConnecting', () => log.info('Opening WebSocket connection...'));
        this.rpc.on('webSocketOpen', () => log.info('WebSocket is now open'));
        this.rpc.on('webSocketError', event => log.error({event}, 'WebSocket error!'));
        this.rpc.on('webSocketClose', closeInfo => log.warn({closeInfo}, 'WebSocket has been closed'));
        this.rpc.on('webSocketClose', ({code}) => {
            if (code === closeCodes.POLICY_VIOLATION) {
                log.warn({code}, 'Stopping because the server sent use a policy violation close code');
                // do not reconnect for a policy violation, which is used to indicate that we have opened too many connections
                this.stop();
            }
        });

        Object.seal(this);
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

    start() {
        this.rpc.start();
    }

    stop() {
        this.rpc.stop();
    }
}

module.exports = CnCClient;
