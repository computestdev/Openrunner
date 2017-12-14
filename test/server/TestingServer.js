'use strict';
/* eslint-env node */
const os = require('os');
const {assert} = require('chai');
const Promise = require('bluebird');
const express = require('express');
const http = require('http');
const serveIndex = require('serve-index');
const Throttle = require('throttle');
const {resolve: pathResolve} = require('path');
const {statAsync: stat, createReadStream} = Promise.promisifyAll(require('fs'));
const mime = require('mime');
const morgan = require('morgan');
const jsonHtmlify = require('htmlescape');

const log = require('../../lib/logger')({pid: process.pid, hostname: os.hostname(), MODULE: 'TestingServer'});
const {CnCServer} = require('../..');

const staticDirectoryPath = pathResolve(__dirname, './static');
const HTTP_SOCKET_KEEPALIVE = 10 * 1000;
const DEFAULT_HTTP_TIMEOUT = 30 * 1000;

class TestingServer {
    constructor({listenHost = 'localhost', listenPort}) {
        this.configuredListenHost = listenHost;
        this.configuredListenPort = listenPort;
        this.expressApp = null;
        this.httpServer = null;
        this.cncServer = null;
    }

    async start() {
        log.info('Starting...');

        const app = express();
        this.expressApp = app;

        app.set('x-powered-by', false);
        app.use(morgan('dev'));

        /**
         * Supported query parameters:
         *
         * waitBeforeResponse - Wait this many milliseconds before sending a response
         * noCache - Send no cache headers
         * bytesPerSecond - Throttle the response streaming of static files (in bytes per second)
         */

        app.use((request, response, next) => {
            if (request.query.waitBeforeResponse) {
                setTimeout(() => next(), Number(request.query.waitBeforeResponse));
            }
            else {
                next();
            }
        });

        app.use((request, response, next) => {
            if ('noCache' in request.query) {
                response.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // HTTP 1.1.
                response.set('Pragma', 'no-cache'); // HTTP 1.0.
                response.set('Expires', '0'); // Proxies.
            }
            next();
        });

        app.get('/', (request, response) => {
            response.status(404).send(`<a href="/static">Interesting stuff is at /static`);
        });

        app.get('/static/*', (request, response, next) => {
            const path = pathResolve(staticDirectoryPath, './' + request.path.substr('/static/'.length));

            if (!path.startsWith(staticDirectoryPath)) {
                throw Error('Invalid request.path');
            }

            stat(path).then(stats => {
                if (!stats.isFile()) {
                    next();
                    return;
                }

                response.setHeader('Content-Type', mime.getType(path));

                const readStream = createReadStream(path);

                if (request.query.bytesPerSecond) {
                    readStream.pipe(new Throttle({
                        bps: Number(request.query.bytesPerSecond),
                    })).pipe(response);
                }
                else {
                    readStream.pipe(response);
                }

            })
            .catch(error => (error.code === 'ENOENT' ? next() : next(error)));
        });
        app.use('/static', serveIndex(staticDirectoryPath, {icons: true}));

        app.get('/404', (request, response) => {
            response.status(404).send('Thing not found!');
        });

        app.get('/empty', (request, response) => {
            response.status(200).send('');
        });

        app.get('/headers/json', (request, response) => {
            response.status(200);
            response.header('X-Foo', 'Value for the X-Foo Header');
            response.header('X-Bar', 'Value for the X-Bar Header');
            response.json({headers: request.headers});
        });

        app.get('/headers/html', (request, response) => {
            response.status(200);
            response.header('X-Foo', 'Value for the X-Foo Header');
            response.header('X-Bar', 'Value for the X-Bar Header');
            response.type('html');
            response.send(`<!DOCTYPE html>
<html>
    <head>
        <title>Headers</title>
        <script>window.requestHeaders = ${jsonHtmlify(request.headers)}</script>
    </head>
    <body>
        <pre id="requestHeadersDisplay"></pre>
        <script>requestHeadersDisplay.textContent = JSON.stringify(requestHeaders, null, 2)</script>
    </body>
</html>
            `);
        });

        app.use((request, response) => {
            response.status(404).send('Thing not found!');
        });

        app.use((error, request, response, next) => {
            console.error(error.stack);
            response.status(500).send('Something broke!');
        });

        this.httpServer = http.createServer(app);
        this.httpServer.on('connection', socket => {
            socket.setKeepAlive(true, HTTP_SOCKET_KEEPALIVE);
            socket.unref(); // Prevent these sockets from keeping the test runner process alive
        });
        this.httpServer.timeout = DEFAULT_HTTP_TIMEOUT;

        this.httpServer.listen(this.configuredListenPort, this.configuredListenHost);
        await new Promise(resolve => this.httpServer.once('listening', resolve));
        const address = this.httpServer.address();

        this.cncServer = new CnCServer({httpServer: this.httpServer});
        await this.cncServer.start();

        log.warn({address}, 'Started');
    }

    async stop() {
        log.info('Stopping...');

        if (this.cncServer) {
            await this.cncServer.stop();
            this.cncServer = null;
        }

        if (this.httpServer) {
            await Promise.fromCallback(cb => this.httpServer.close(cb));
            this.httpServer = null;
            log.info('HTTP server has been closed');
        }

        log.warn('Stopped');
    }

    get listenPort() {
        assert(this.httpServer, 'Server has not been started');
        return this.httpServer.address().port;
    }

    async waitForActiveCnCConnection() {
        await this.cncServer.waitForActiveConnection();
    }

    async runScript({scriptContent, stackFileName}) {
        return await this.cncServer.runScript({scriptContent, stackFileName});
    }

    async runScriptFromFunction(func, injected = {}) {
        const stackFileName = (func.name || 'integrationTest') + 'js';
        const scriptContent =
            `const injected = ${JSON.stringify(injected)};` +
            func.toString().replace(/^async\s*\(\)\s*=>\s*{|}$/g, '');
        return await this.runScript({scriptContent, stackFileName});
    }

    async reportCodeCoverage() {
        return await this.cncServer.reportCodeCoverage();
    }

}

module.exports = TestingServer;
