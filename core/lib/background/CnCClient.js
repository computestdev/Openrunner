'use strict';
const RobustWebSocket = require('robust-websocket');
const JSONBird = require('jsonbird');
const {generate: generateShortId} = require('shortid');
const {assert} = require('chai');

const URL = require('../../../lib/URL');
const URLSearchParams = require('../../../lib/URLSearchParams');
const {WS_CLOSE_NORMAL, WS_CLOSE_TIMEOUT, WS_CLOSE_POLICY_VIOLATION} = require('../../../lib/webSocketCodes');
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'background/CnCClient'});

// all timeout/delay values are in milliseconds:
const CONNECTION_TIMEOUT = 2000;
const PING_INTERVAL = 2000;
const PING_TIMEOUT = 1000; // (timeout of a single ping call)
const PING_CONSECUTIVE_FAILURE_DROP = 5;

const RECONNECT_BASE = 100;
const RECONNECT_MAXIMUM_DELAY = 10000;
const reconnectSleep = attempt => Math.ceil(Math.random() * Math.min(RECONNECT_MAXIMUM_DELAY, RECONNECT_BASE * 2 ** attempt));

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
        this.wsUrl = websocketCnCUrl({host, port, runtimeVersions, instanceId: this.instanceId});
        this.webSocket = null;
        this.rpc = new JSONBird({
            defaultTimeout: 10000,
            readableMode: 'json-message',
            writableMode: 'json-stream',
            receiveErrorStack: true,
            sendErrorStack: true,
            pingInterval: PING_INTERVAL,
            pingTimeout: PING_TIMEOUT,
        });
        this.handleWSOpen = this.handleWSOpen.bind(this);
        this.handleWSMessage = this.handleWSMessage.bind(this);
        this.handleWSClose = this.handleWSClose.bind(this);
        this.handleWSError = this.handleWSError.bind(this);
        this.handleRpcData = this.handleRpcData.bind(this);
        this.handleRpcPingFail = this.handleRpcPingFail.bind(this);

        this.rpc.on('error', err => log.error({err}, 'RPC Error'));
        this.rpc.on('protocolError', err => log.warn({err}, 'RPC Protocol error'));
        this.rpc.on('pingFail', this.handleRpcPingFail);
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

    async notify(...args) {
        return this.rpc.notify(...args);
    }

    notifications(methods) {
        this.rpc.notifications(methods);
    }

    notification(name, func) {
        this.rpc.notification(name, func);
    }

    start() {
        assert.isNull(this.webSocket, 'Already started');
        this.webSocket = new RobustWebSocket(String(this.wsUrl), null, {
            timeout: CONNECTION_TIMEOUT,
            ignoreConnectivityEvents: true, // we are connect to localhost
            shouldReconnect: (event, ws) => (
                // do not reconnect for a policy violation, which is used to indicate that we have opened too many connections
                event.code === WS_CLOSE_POLICY_VIOLATION
                    ? false
                    : reconnectSleep(ws.attempts)
            ),
        });
        this.webSocket.addEventListener('open', this.handleWSOpen);
        this.webSocket.addEventListener('message', this.handleWSMessage);
        this.webSocket.addEventListener('close', this.handleWSClose);
        this.webSocket.addEventListener('error', this.handleWSError);
        this.rpc.startPinging();
    }

    stop() {
        this.rpc.stopPinging();

        if (this.webSocket) {
            this.webSocket.close(WS_CLOSE_NORMAL, 'Bye!', {keepClosed: true});
            this.webSocket.removeEventListener('open', this.handleWSOpen);
            this.webSocket.removeEventListener('message', this.handleWSMessage);
            this.webSocket.removeEventListener('close', this.handleWSClose);
            this.webSocket.removeEventListener('error', this.handleWSError);
            this.webSocket = null;
        }
    }

    /**
     * Called on every (re)connect
     */
    handleWSOpen() {
        try {
            this.webSocket.binaryType = 'arraybuffer';
            this.rpc.resetPingStatistics();
            this.rpc.on('data', this.handleRpcData); // start flowing the stream
            log.info('WebSocket connection is now open');
        }
        catch (err) {
            log.error({err}, 'Error during event handler WebSocket => open');
        }
    }

    handleWSMessage(event) {
        try {
            if (typeof event.data === 'string') {
                // sent as an unicode string
                this.rpc.write(event.data);
            }
            else {
                // sent as binary data (event.data is ArrayBuffer)
                const data = Buffer.from(event.data);
                this.rpc.write(data);
            }
        }
        catch (err) {
            log.error({err}, 'Error during event handler WebSocket => message');
        }
    }

    handleWSClose({code, reason, wasClean}) {
        log.warn({code, reason, wasClean}, 'WebSocket connection has been closed');
        this.rpc.removeAllListeners('data'); // stop flowing the stream
    }

    handleWSError(event) {
        log.error({event}, 'WebSocket error');
    }

    handleRpcData(string) {
        try {
            this.webSocket.send(string);
        }
        catch (err) {
            log.error({err}, 'Error during event handler RPC => data');
        }
    }

    handleRpcPingFail(consecutiveFails) {
        try {
            if (consecutiveFails >= PING_CONSECUTIVE_FAILURE_DROP) {
                log.error({consecutiveFails}, 'Closing connection because of ping timeout');
                this.webSocket.close(WS_CLOSE_TIMEOUT, 'Ping timeout', {keepClosed: false});
                this.rpc.removeAllListeners('data');
            }
        }
        catch (err) {
            log.error({err}, 'Error during event handler RPC => pingFail');
        }
    }
}

module.exports = CnCClient;
