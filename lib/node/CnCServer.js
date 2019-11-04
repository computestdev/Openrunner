'use strict';
const ws = require('ws');
const {assert} = require('chai');
const http = require('http');
const Promise = require('bluebird');

const URL = require('../URL');
const log = require('../logger')({hostname: 'background', MODULE: 'CnCServer'});
const {WS_CLOSE_NORMAL, WS_CLOSE_POLICY_VIOLATION} = require('../webSocketCodes');
const CnCServerConnection = require('./CnCServerConnection');
const {PING_INTERVAL, PING_TIMEOUT, PING_CONSECUTIVE_FAILURE_DROP} = require('./CnCServerConnection');

const HTTP_SOCKET_KEEPALIVE_MS = 10 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 30 * 1000;

const defaultRequestListener = (request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/plain');
    response.end(
        'Hello! This is a HTTP server that listens on the loopback interface, ' +
        'used to send RPC commands to the Openrunner browser extension\n',
    );
};

class CnCServer {
    constructor({httpServer = null, httpPort = 0, requestListener = defaultRequestListener} = {}) {
        if (httpServer) {
            this.manageHttpServer = null;
            this.httpServer = httpServer;
        }
        else {
            this.manageHttpServer = {requestListener, httpPort};
            this.httpServer = null; // created in .start()
        }
        this.wsServer = null;
        this.activeConnection = null;
        this.activeInstanceId = null;
        this.runScriptCount = 0;
        this._rejectPendingRunScript = new Set();
        this._resolveWaitForActiveConnection = [];
        this.lastRunScriptBegin = NaN;
        this.lastRunScriptEnd = NaN;
        Object.seal(this);
    }

    async start() {
        if (this.manageHttpServer) {
            const {requestListener, httpPort} = this.manageHttpServer;
            this.httpServer = http.createServer(requestListener);
            this.httpServer.on('connection', socket => {
                socket.setKeepAlive(true, HTTP_SOCKET_KEEPALIVE_MS);
                socket.unref(); // Prevent these sockets from keeping the node.js process alive
            });
            this.httpServer.timeout = DEFAULT_HTTP_TIMEOUT_MS;

            this.httpServer.listen(httpPort, '127.0.0.1');
            await new Promise(resolve => this.httpServer.once('listening', resolve));
        }

        this.wsServer = new ws.Server({
            server: this.httpServer,
            path: '/openrunner-cnc',
        });
        this.wsServer.on('connection', (webSocket, httpRequest) => this.handleNewConnection(webSocket, httpRequest));
        this.wsServer.on('error', err => log.error({err}, 'WebSocket Server error'));

        log.debug({address: this.httpServer.address()}, 'Started Command & Control HTTP server');
    }

    async stop() {
        log.debug('Stopping Command & Control HTTP server');
        this._rejectAllPendingRunScript(Error('The server is stopping'));
        this.destroyActiveConnection(WS_CLOSE_NORMAL, 'Bye!');
        this.activeConnection = null;

        if (this.wsServer) {
            this.wsServer.close();
        }
        this.wsServer = null;

        if (this.manageHttpServer && this.httpServer) {
            await Promise.fromCallback(cb => this.httpServer.close(cb));
            this.httpServer = null;
        }
    }

    get listenPort() {
        const address = this.httpServer.address();
        assert(address, 'HTTP server has not been started');
        return address.port;
    }

    _rejectAllPendingRunScript(err) {
        const rejects = [...this._rejectPendingRunScript];
        this._rejectPendingRunScript.clear();
        rejects.forEach(reject => reject(err));
    }

    handleNewConnection(webSocket, httpRequest) {
        try {
            const {connection: {remoteAddress, remoteFamily, remotePort}} = httpRequest;
            const oldInstanceId = this.activeInstanceId;
            log.info(
                {remoteAddress, remoteFamily, remotePort, url: httpRequest.url, oldInstanceId},
                'Incoming WebSocket connection',
            );

            const url = new URL(`ws://localhost${httpRequest.url}`);
            const instanceId = url.searchParams.get('instanceId');

            if (oldInstanceId !== instanceId) {
                log.warn({oldInstanceId, instanceId}, 'The browser has (re)started');
                this._rejectAllPendingRunScript(Error('The browser has restarted unexpectedly'));
                this.destroyActiveConnection(
                    WS_CLOSE_POLICY_VIOLATION,
                    'Closing old connection because a new connection with a new instanceId has been made',
                );
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
        this.lastRunScriptBegin = Date.now();
        let rejectPending;
        try {
            return await Promise.race([
                new Promise((resolve, reject) => {
                    rejectPending = reject;
                    this._rejectPendingRunScript.add(rejectPending);
                }),
                this.activeConnection.runScript({scriptContent, stackFileName}),
            ]);
        }
        finally {
            this._rejectPendingRunScript.delete(rejectPending);
            this.lastRunScriptEnd = Date.now();
        }
    }

    async reportCodeCoverage() {
        assert.isOk(this.activeConnection, 'There is no active connection from the web browser');
        return await this.activeConnection.call('reportCodeCoverage');
    }

    async waitForActiveConnection() {
        if (this.activeConnection && this.activeConnection.hasActiveConnection) {
            return;
        }

        await new Promise((resolve) => {
            this._resolveWaitForActiveConnection.push(resolve);
        });
    }

    closeActiveWebSocket(wsCode, reason) {
        const {activeConnection} = this;
        if (!activeConnection) {
            return false;
        }

        return activeConnection.closeActiveWebSocket(wsCode, reason);
    }

    destroyActiveConnection(wsCode, reason) {
        const {activeConnection} = this;
        if (!activeConnection) {
            return false;
        }

        this._rejectAllPendingRunScript(Error(reason));

        this.activeConnection = null;
        activeConnection.destroy(wsCode, reason);
        return true;
    }

    get hasActiveConnection() {
        return Boolean(this.activeConnection && this.activeConnection.hasActiveConnection);
    }

    get lastSuccessfulPing() {
        return this.activeConnection ? this.activeConnection.lastSuccessfulPing : NaN;
    }

    get isRunningScript() {
        return Boolean(this.activeConnection && this.activeConnection.isRunningScript);
    }

    get lastReportedVersion() {
        return this.activeConnection && this.activeConnection.lastReportedVersion;
    }
}

CnCServer.promiseDisposer = httpPort => Promise.try(async () => {
    const cncServer = new CnCServer({httpPort});
    await cncServer.start();
    return cncServer;
})
.disposer(async cncServer => {
    await cncServer.stop();
});


module.exports = CnCServer;
CnCServer.PING_INTERVAL = PING_INTERVAL;
CnCServer.PING_TIMEOUT = PING_TIMEOUT;
CnCServer.PING_CONSECUTIVE_FAILURE_DROP = PING_CONSECUTIVE_FAILURE_DROP;
Object.freeze(CnCServer);
