'use strict';
const JSONBird = require('jsonbird');
const {assert} = require('chai');

const log = require('./logger')({hostname: 'background', MODULE: 'CnCServerConnection'});
const {WS_CLOSE_TIMEOUT, WS_CLOSE_INTERNAL_ERROR, WS_CLOSE_POLICY_VIOLATION} = require('./webSocketCodes');
const getRunnerScriptMetadata = require('./getRunnerScriptMetadata');
const URL = require('./URL');

const PING_INTERVAL = 2000;
const PING_TIMEOUT = 1000; // (timeout of a single ping call)
const PING_CONSECUTIVE_FAILURE_DROP = 5;

class CnCServerConnection {
    constructor() {
        this.rpc = new JSONBird({
            defaultTimeout: 10000,
            readableMode: 'json-message',
            writableMode: 'json-stream',
            receiveErrorStack: true,
            sendErrorStack: true,
            pingInterval: PING_INTERVAL,
            pingTimeout: PING_TIMEOUT,
        });
        this.rpc.on('error', err => log.error({err}, 'RPC Error'));
        this.rpc.on('protocolError', err => log.warn({err}, 'RPC Protocol error'));
        this.rpc.on('pingFail', (consecutiveFails, err) => this._handleRpcPingFail(consecutiveFails, err));
        this.rpc.on('pingSuccess', delay => this._handleRpcPingSuccess(delay));
        this.activeWebSocket = null;

        this.lastSuccessfulPing = NaN;
        this.isRunningScript = false;
        this.runScriptCount = 0;
        this.lastRunScriptBegin = NaN;
        this.lastRunScriptEnd = NaN;
        this.lastReportedVersion = null;

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

    get hasActiveConnection() {
        return Boolean(this.activeWebSocket);
    }

    _markWebSocketAsClosed(webSocket) {
        const wasActive = webSocket === this.activeWebSocket;
        if (wasActive) {
            this.rpc.removeAllListeners('data');
            this.rpc.stopPinging();
            this.activeWebSocket = null;
        }
    }

    closeActiveWebSocket(code, reason) {
        const webSocket = this.activeWebSocket;
        if (!webSocket) {
            return false;
        }

        log.info({code, reason}, 'Closing active WebSocket');
        this._markWebSocketAsClosed(webSocket);
        webSocket.close(code, reason);
        return true;
    }

    destroy(code, reason) {
        try {
            this.closeActiveWebSocket(code, reason);
        }
        finally {
            this.rpc.end(); // abort all pending RPC calls
        }
    }

    setActiveWebSocket(webSocket, httpRequest) {
        if (this.rpc.ended) {
            throw Error('Invalid state: this CnCServerConnection has ended');
        }

        const url = new URL(`ws://localhost${httpRequest.url}`);
        const param = name => url.searchParams.get(name);
        this.lastReportedVersion = Object.freeze({
            runnerName: param('runnerName'),
            runnerVersion: param('runnerVersion'),
            platformOs: param('platformOs'),
            browserName: param('browserName'),
            browserVendor: param('browserVendor'),
            browserVersion: param('browserVersion'),
            browserBuild: param('browserBuild'),
        });

        webSocket.binaryType = 'nodebuffer';

        // Only a single connection is allowed. If the browser crashes and restarts,
        // the new connection will simply overwrite the old one
        this.closeActiveWebSocket(
            WS_CLOSE_POLICY_VIOLATION,
            'Policy Violation: Only a single connection is allowed, the older connection has been closed'
        );

        this.activeWebSocket = webSocket;
        webSocket.addEventListener('error', err => this._handleWSError(webSocket, err));
        webSocket.addEventListener('close', event => this._handleWSClose(webSocket, event));
        webSocket.addEventListener('message', event => this._handleWSMessage(webSocket, event));
        this.rpc.resetPingStatistics();
        this.rpc.startPinging();

        // start flowing the stream:
        this.rpc.on('data', string => this._handleRpcData(string));
    }

    _handleWSMessage(webSocket, event) {
        try {
            if (this.activeWebSocket !== webSocket) {
                return;
            }

            // event.data is either a string or a Buffer
            this.rpc.write(event.data);
        }
        catch (err) {
            log.error({err}, 'Error during event handler WebSocket => message');
        }
    }

    _handleWSError(webSocket, err) {
        try {
            const wasActive = webSocket === this.activeWebSocket;
            log.error({wasActive, err}, 'WebSocket error, closing');
            this._markWebSocketAsClosed(webSocket);
            webSocket.close(WS_CLOSE_INTERNAL_ERROR, 'Internal Error: error event');
        }
        catch (err2) {
            log.error({err: err2}, 'Error during event handler WebSocket => error');
        }
    }

    _handleWSClose(webSocket, {code, reason, wasClean}) {
        try {
            const wasActive = webSocket === this.activeWebSocket;
            log.info({wasActive, code, reason, wasClean}, 'WebSocket connection has been closed');
            this._markWebSocketAsClosed(webSocket);
        }
        catch (err) {
            log.error({err}, 'Error during event handler WebSocket => close');
        }
    }

    _handleRpcData(string) {
        try {
            this.activeWebSocket.send(string);
        }
        catch (err) {
            log.error({err}, 'Error during event handler RPC => data');
        }
    }

    _handleRpcPingFail(consecutiveFails, err) {
        try {
            if (consecutiveFails >= PING_CONSECUTIVE_FAILURE_DROP) {
                log.error({consecutiveFails}, 'Closing connection because of ping timeout');
                this.closeActiveWebSocket(WS_CLOSE_TIMEOUT, 'Ping timeout');
            }
        }
        catch (err2) {
            log.error({err: err2}, 'Error during event handler RPC => pingFail');
        }
    }

    _handleRpcPingSuccess(delay) {
        this.lastSuccessfulPing = Date.now();
    }

    async runScript({scriptContent, stackFileName}) {
        const {runTimeoutMs} = getRunnerScriptMetadata(scriptContent);
        assert.isFalse(this.isRunningScript, 'A previous script run is still in progress');

        // resolves with a json object of the results, or it rejects with an error during the script run
        this.isRunningScript = true;
        ++this.runScriptCount;
        this.lastRunScriptBegin = Date.now();

        try {
            const commandTimeout = runTimeoutMs + 30000;
            log.info({runTimeoutMs, commandTimeout, stackFileName}, 'runScript(): Sending command to browser');

            const scriptResult = await this.call({name: 'runScript', timeout: commandTimeout}, {scriptContent, stackFileName});
            log.info({scriptError: scriptResult && scriptResult.error, stackFileName}, 'runScript(): Completed');
            return scriptResult;
        }
        catch (err) {
            log.warn({err, stackFileName}, 'runScript(): Error during command');
            throw err;
        }
        finally {
            this.isRunningScript = false;
            this.lastRunScriptEnd = Date.now();
        }
    }
}

module.exports = CnCServerConnection;
