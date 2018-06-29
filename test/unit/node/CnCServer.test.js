'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
require('chai').use(require('chai-as-promised'));
const sinon = require('sinon');
const {assert: {deepEqual: deq, strictEqual: eq, isNaN, isRejected, isAtLeast, closeTo, lengthOf}} = require('chai');
const http = require('http');
const Promise = require('bluebird');

const connectCnCClient = require('../../utilities/cncClient');
const PromiseFateTracker = require('../../utilities/PromiseFateTracker');
const CnCServer = require('../../../lib/node/CnCServer');
const {PING_INTERVAL, PING_TIMEOUT, PING_CONSECUTIVE_FAILURE_DROP} = require('../../../lib/node/CnCServer');

describe('CnCServer', suite => {
    suite.slow(200);
    let httpServer;
    let port;
    let cncServer;
    let client;

    beforeEach(async () => {
        httpServer = http.createServer((request, response) => {
            response.end('Hello!');
        });
        httpServer.on('connection', socket => {
            socket.unref(); // Prevent these sockets from keeping the test runner process alive
        });
        httpServer.listen(0, '127.0.0.1');
        await new Promise(resolve => httpServer.once('listening', resolve));
        port = httpServer.address().port;
        isAtLeast(port, 1);

        cncServer = new CnCServer({httpServer});
    });

    afterEach(async () => {
        await cncServer.stop();
        cncServer = null;
        await Promise.fromCallback(cb => httpServer.close(cb));
        httpServer = null;

        if (client) {
            await client.close();
            client = null;
        }
    });

    it('Should return correct values for all public properties when the server has not yet been started', () => {
        eq(cncServer.hasActiveConnection, false);
        eq(cncServer.isRunningScript, false);
        isNaN(cncServer.lastSuccessfulPing);
        isNaN(cncServer.lastRunScriptBegin);
        isNaN(cncServer.lastRunScriptEnd);
        eq(cncServer.lastReportedVersion, null);
        eq(cncServer.runScriptCount, 0);
    });

    it('Should return correct values for all public properties when there is no connection yet', async () => {
        await cncServer.start();
        eq(cncServer.hasActiveConnection, false);
        eq(cncServer.isRunningScript, false);
        isNaN(cncServer.lastSuccessfulPing);
        isNaN(cncServer.lastRunScriptBegin);
        isNaN(cncServer.lastRunScriptEnd);
        eq(cncServer.lastReportedVersion, null);
        eq(cncServer.runScriptCount, 0);
    });

    it('Should not allow a script be ran if there is no connection', async () => {
        await isRejected(cncServer.runScript({scriptContent: '"openrunner-script:v1"; foo()'}), /no.*active.*connection/i);
    });

    it('Should return correct values for all getters when a connection has just been established', async () => {
        await cncServer.start();
        client = await connectCnCClient(port);
        eq(cncServer.hasActiveConnection, true);
        eq(cncServer.isRunningScript, false);
        isNaN(cncServer.lastSuccessfulPing);
        isNaN(cncServer.lastRunScriptBegin);
        isNaN(cncServer.lastRunScriptEnd);
        deq(cncServer.lastReportedVersion, {
            browserBuild: '20171226085105',
            browserName: 'Firefox',
            browserVendor: 'Mozilla',
            browserVersion: '58.0',
            platformOs: 'mac',
            runnerName: 'Openrunner',
            runnerVersion: '2.1234.5',
        });
        eq(cncServer.runScriptCount, 0);
    });

    it('Should send pings to the connected client', {slow: 5000, timeout: 10000}, async () => {
        await cncServer.start();
        client = await connectCnCClient(port);
        const connectionOpenTime = Date.now();
        await client.waitForPing.waitUntil(1).then(() => Promise.delay(25));
        // 2000 is the ping interval
        closeTo(cncServer.lastSuccessfulPing, connectionOpenTime + 2000, 100);
        eq(cncServer.hasActiveConnection, true);
    });

    it('Should send a runScript call to the client', async () => {
        await cncServer.start();
        client = await connectCnCClient(port);
        eq(cncServer.hasActiveConnection, true);
        const runScriptFate = new PromiseFateTracker();

        eq(cncServer.runScriptCount, 0);
        runScriptFate.track('first', cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; foo();',
            stackFileName: 'test-file.js',
        }));
        eq(cncServer.isRunningScript, true);
        eq(cncServer.runScriptCount, 1);

        await client.waitForMessage.waitUntil(1);
        lengthOf(client.messages, 1);
        runScriptFate.assertPending('first');

        const runScriptMessage = client.messages[0];
        deq(runScriptMessage, {
            id: runScriptMessage.id, // generated
            jsonrpc: '2.0',
            method: 'runScript',
            params: [
                {
                    scriptContent: '"Openrunner-Script: v1"; foo();',
                    stackFileName: 'test-file.js',
                },
            ],
        });

        client.send({id: runScriptMessage.id, jsonrpc: '2.0', result: {error: null, result: 123}});
        await runScriptFate.waitForAllSettled();
        runScriptFate.assertResolved('first', {error: null, result: 123});
        eq(cncServer.isRunningScript, false);
        eq(cncServer.runScriptCount, 1);
    });

    it('Should not allow simultaneous script runs', async () => {
        await cncServer.start();
        client = await connectCnCClient(port);
        eq(cncServer.hasActiveConnection, true);
        const runScriptFate = new PromiseFateTracker();

        eq(cncServer.runScriptCount, 0);
        runScriptFate.track('first', cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; foo();',
            stackFileName: 'test-file.js',
        }));
        runScriptFate.track('second', cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; bar();',
            stackFileName: 'test-file.js',
        }));
        eq(cncServer.isRunningScript, true);
        eq(cncServer.runScriptCount, 2);

        await client.waitForMessage.waitUntil(1);
        lengthOf(client.messages, 1);
        const runScriptMessage = client.messages[0];
        client.send({id: runScriptMessage.id, jsonrpc: '2.0', result: {error: null, result: 123}});

        await runScriptFate.waitForAllSettled();
        runScriptFate.assertResolved('first', {error: null, result: 123});
        runScriptFate.assertRejected('second', Error, /previous.*still.*progress/i);
        eq(cncServer.isRunningScript, false);
        eq(cncServer.runScriptCount, 2);
    });

    it('Should support running another script after the previous one completes', {slow: 300}, async () => {
        await cncServer.start();
        client = await connectCnCClient(port);
        eq(cncServer.hasActiveConnection, true);
        const runScriptFate = new PromiseFateTracker();

        eq(cncServer.runScriptCount, 0);
        runScriptFate.track('first', cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; foo();',
            stackFileName: 'test-file.js',
        }));
        eq(cncServer.isRunningScript, true);
        eq(cncServer.runScriptCount, 1);
        const firstBegin = cncServer.lastRunScriptBegin;
        closeTo(firstBegin, Date.now(), 50);
        isNaN(cncServer.lastRunScriptEnd);

        await client.waitForMessage.waitUntil(1);
        lengthOf(client.messages, 1);
        const runScriptMessage = client.messages[0];
        client.send({id: runScriptMessage.id, jsonrpc: '2.0', result: {error: null, result: 123}});
        await runScriptFate.waitForAllSettled();
        const firstEnd = cncServer.lastRunScriptEnd;
        closeTo(firstEnd, Date.now(), 50);
        eq(cncServer.lastRunScriptBegin, firstBegin);

        await Promise.delay(100);
        runScriptFate.track('second', cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; bar();',
            stackFileName: 'test-file.js',
        }));
        eq(cncServer.isRunningScript, true);
        eq(cncServer.runScriptCount, 2);
        const secondBegin = cncServer.lastRunScriptBegin;
        closeTo(secondBegin, Date.now(), 50);
        eq(cncServer.lastRunScriptEnd, firstEnd);

        await client.waitForMessage.waitUntil(2);
        lengthOf(client.messages, 2);
        const runScriptMessage2 = client.messages[1];
        client.send({id: runScriptMessage2.id, jsonrpc: '2.0', result: {error: null, result: 456}});

        await runScriptFate.waitForAllSettled();
        const secondEnd = cncServer.lastRunScriptEnd;
        closeTo(secondEnd, Date.now(), 50);
        eq(cncServer.lastRunScriptBegin, secondBegin);
        runScriptFate.assertResolved('first', {error: null, result: 123});
        runScriptFate.assertResolved('second', {error: null, result: 456});
        eq(cncServer.isRunningScript, false);
        eq(cncServer.runScriptCount, 2);
    });

    describe('#waitForActiveConnection()', () => {
        it('Should resolve when an active connection has been established', async () => {
            await cncServer.start();
            const fate = new PromiseFateTracker();
            fate.track('before 1', cncServer.waitForActiveConnection());
            fate.track('before 2', cncServer.waitForActiveConnection());
            await Promise.delay(10);
            fate.assertPending('before 1');
            fate.assertPending('before 2');
            client = await connectCnCClient(port);
            await fate.waitForAllSettled();
            fate.assertResolved('before 1');
            fate.assertResolved('before 2');

            fate.track('after', cncServer.waitForActiveConnection());
            await Promise.delay(0);
            fate.assertResolved('after');
        });
    });

    it('Should support reconnecting without aborting calls', async () => {
        await cncServer.start();
        client = await connectCnCClient(port, 'instance FOO');
        eq(cncServer.hasActiveConnection, true);

        const runScriptPromise = cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; foo();',
            stackFileName: 'test-file.js',
        });
        eq(cncServer.isRunningScript, true);
        await client.waitForMessage.waitUntil(1);
        const runScriptMessage = client.messages[0];

        await client.close();
        client = null;
        await Promise.delay(50);
        eq(cncServer.isRunningScript, true);
        eq(cncServer.hasActiveConnection, false);

        client = await connectCnCClient(port, 'instance FOO');
        client.send({id: runScriptMessage.id, jsonrpc: '2.0', result: {error: null, result: 123}});
        deq(await runScriptPromise, {error: null, result: 123});
        eq(cncServer.isRunningScript, false);
    });

    it('Should abort all calls if a reconnection is made by a different browser instance', async () => {
        await cncServer.start();
        client = await connectCnCClient(port, 'instance FOO');
        eq(cncServer.hasActiveConnection, true);

        const runScriptPromise = cncServer.runScript({
            scriptContent: '"Openrunner-Script: v1"; foo();',
            stackFileName: 'test-file.js',
        });
        runScriptPromise.catch(() => {}); // disable the annoying node.js warning
        eq(cncServer.isRunningScript, true);
        await client.waitForMessage.waitUntil(1);

        await client.close();
        client = null;
        await Promise.delay(50);
        eq(cncServer.isRunningScript, true);
        eq(cncServer.hasActiveConnection, false);

        client = await connectCnCClient(port, 'instance BAR');
        await isRejected(runScriptPromise, Error, 'The browser has restarted unexpectedly');
        eq(cncServer.isRunningScript, false);
    });

    describe('Pinging', () => {
        let clock;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });
        afterEach(() => {
            clock.restore();
            clock = null;
        });

        it('Should close connections if they do not respond to pings', async () => {
            await cncServer.start();
            client = await connectCnCClient(port, 'instance FOO');
            eq(cncServer.hasActiveConnection, true);
            eq(client.closed, false);

            client.replyToPings = false;

            const tick = () => clock.tick(PING_INTERVAL + PING_TIMEOUT);
            for (let n = 0; n < PING_CONSECUTIVE_FAILURE_DROP; ++n) {
                await client.waitForPing.waitForSideEffect(1, tick);
                eq(client.closed, false);
            }

            await client.waitForClose.waitUntil(1);
            deq(client.closed, {code: 4000, message: 'Ping timeout'});
        });
    });


    describe('#closeActiveWebSocket', () => {
        it('Should close the current connection, but not abort any calls', async () => {
            await cncServer.start();
            client = await connectCnCClient(port, 'instance FOO');
            eq(cncServer.hasActiveConnection, true);

            const runScriptPromise = cncServer.runScript({
                scriptContent: '"Openrunner-Script: v1"; foo();',
                stackFileName: 'test-file.js',
            });
            eq(cncServer.isRunningScript, true);
            await client.waitForMessage.waitUntil(1);
            const runScriptMessage = client.messages[0];

            eq(cncServer.closeActiveWebSocket(4123, 'foo bar reason'), true);
            await Promise.delay(50);
            eq(cncServer.isRunningScript, true);
            eq(cncServer.hasActiveConnection, false);
            deq(client.closed, {code: 4123, message: 'foo bar reason'});

            client = await connectCnCClient(port, 'instance FOO');
            client.send({id: runScriptMessage.id, jsonrpc: '2.0', result: {error: null, result: 123}});
            deq(await runScriptPromise, {error: null, result: 123});
            eq(cncServer.isRunningScript, false);
        });

        it('Should have no effect if there is no connection', async () => {
            await cncServer.start();
            eq(cncServer.closeActiveWebSocket(4123, 'foo bar reason'), false);
        });
    });

    describe('#destroyActiveConnection', () => {
        it('Should close the current connection, and also abort all calls', async () => {
            await cncServer.start();
            client = await connectCnCClient(port, 'instance FOO');
            eq(cncServer.hasActiveConnection, true);

            const runScriptPromise = cncServer.runScript({
                scriptContent: '"Openrunner-Script: v1"; foo();',
                stackFileName: 'test-file.js',
            });
            runScriptPromise.catch(() => {}); // disable the annoying node.js warning
            eq(cncServer.isRunningScript, true);
            await client.waitForMessage.waitUntil(1);

            await cncServer.destroyActiveConnection(4123, 'foo bar reason');
            await Promise.delay(50);
            eq(cncServer.isRunningScript, false);
            eq(cncServer.hasActiveConnection, false);
            deq(client.closed, {code: 4123, message: 'foo bar reason'});
            await isRejected(runScriptPromise, Error, 'foo bar reason');
        });

        it('Should have no effect if there is no connection', async () => {
            await cncServer.start();
            cncServer.destroyActiveConnection(4123, 'foo bar reason');
        });
    });
});
