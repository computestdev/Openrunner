'use strict';
const ws = require('ws');
const {assert} = require('chai');

const URL = require('./URL');
const log = require('./logger')({hostname: 'background', MODULE: 'CnCServer'});
const {WS_CLOSE_NORMAL} = require('./webSocketCodes');
const CnCServerConnection = require('./CnCServerConnection');

class CnCServer {
    constructor({httpServer}) {
        assert.isOk(httpServer, 'Invalid argument `httpServer`');
        this.httpServer = httpServer;
        this.wsServer = null;
        this.activeConnection = null;
        this.activeInstanceId = null;
        this.runScriptCount = 0;
        this._rejectPendingRunScript = [];
        this._resolveWaitForActiveConnection = [];
        Object.seal(this);
    }

    async start() {
        this.wsServer = new ws.Server({
            server: this.httpServer,
            path: '/openrunner-cnc',
        });
        this.wsServer.on('connection', (webSocket, httpRequest) => this.handleNewConnection(webSocket, httpRequest));
        this.wsServer.on('error', err => log.error({err}, 'WebSocket Server error'));
    }

    async stop() {
        this._rejectPendingRunScript.forEach(reject => reject(Error('The server is stopping')));
        this._rejectPendingRunScript = [];

        if (this.activeConnection) {
            this.activeConnection.closeActiveWebSocket(WS_CLOSE_NORMAL, 'Bye!');
        }

        this.wsServer.close();
        this.wsServer = null;
    }

    handleNewConnection(webSocket, httpRequest) {
        try {
            const {connection: {remoteAddress, remoteFamily, remotePort}} = httpRequest;
            const oldInstanceId = this.activeInstanceId;
            log.info(
                {remoteAddress, remoteFamily, remotePort, url: httpRequest.url, oldInstanceId},
                'Incoming WebSocket connection'
            );

            const url = new URL(`ws://localhost${httpRequest.url}`);
            const instanceId = url.searchParams.get('instanceId');

            if (oldInstanceId !== instanceId) {
                log.warn({oldInstanceId, instanceId}, 'The browser has (re)started');

                this._rejectPendingRunScript.forEach(reject => reject(Error('The browser has restarted unexpectedly')));
                this._rejectPendingRunScript = [];

                if (this.activeConnection) {
                    this.activeConnection.closeActiveWebSocket(WS_CLOSE_NORMAL, 'Bye!');
                    this.activeConnection = null;
                }

                this.activeConnection = new CnCServerConnection();
                this.activeInstanceId = instanceId;
            }

            // currently only a single connection per server is supported, we could extend this later by creating multiple
            // instances of CnCServerConnection, and indexing them by the instanceId sent by the client.
            this.activeConnection.setActiveWebSocket(webSocket, httpRequest);
            this._resolveWaitForActiveConnection.forEach(resolve => resolve());
            this._resolveWaitForActiveConnection = [];
        }
        catch (err) {
            log.error({err}, 'Error during event handler WebSocket Server => connect');
        }
    }

    async runScript({scriptContent, stackFileName}) {
        assert.isOk(this.activeConnection, 'There is no active connection from the web browser');

        ++this.runScriptCount;
        return await Promise.race([
            new Promise((resolve, reject) => {
                this._rejectPendingRunScript.push(reject);
            }),
            this.activeConnection.runScript({scriptContent, stackFileName}),
        ]);
    }

    async waitForActiveConnection() {
        if (this.activeConnection && this.activeConnection.hasActiveConnection) {
            return;
        }

        await new Promise((resolve) => {
            this._resolveWaitForActiveConnection.push(resolve);
        });
    }

    get lastSuccessfulPing() {
        return this.activeConnection && this.activeConnection.lastSuccessfulPing;
    }

    get isRunningScript() {
        return this.activeConnection && this.activeConnection.isRunningScript;
    }

    get lastRunScriptBegin() {
        return this.activeConnection && this.activeConnection.lastRunScriptBegin;
    }

    get lastRunScriptEnd() {
        return this.activeConnection && this.activeConnection.lastRunScriptEnd;
    }

    get lastReportedVersion() {
        return this.activeConnection && this.activeConnection.lastReportedVersion;
    }
}

module.exports = CnCServer;
