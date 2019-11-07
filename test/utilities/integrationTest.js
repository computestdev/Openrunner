'use strict';
/* eslint-env node */
const {assert} = require('chai');
const fs = require('fs-extra');

const {OpenrunnerClient} = require('../..');
const TestingServer = require('../server/TestingServer');
const log = require('../../lib/logger')({hostname: 'test', MODULE: 'integrationTest'});
const {mergeCoverageReports} = require('../../lib/mergeCoverage');
const findFreeTCPPort = require('../../lib/node/findFreeTCPPort');
const {temporaryDirectory} = require('../../lib/node/temporaryFs');
const {
    TEST_TEMP_DIR,
    TEST_FIREFOX_BIN,
    TEST_SERVER_CNC_PORT,
    TEST_SERVER_PORT,
    TEST_SERVER_EXTRA_PORT,
    TEST_SERVER_BAD_TLS_PORT,
    TEST_HEADLESS,
    TEST_DEBUG,
    TEST_RESTART_BROWSER_EVERY,
} = require('./testEnv');

const debugMode = TEST_DEBUG === '1';
let cncPort;
let buildCacheDisposer = null;
let openrunnerDisposer = null;
let server = null;
let startPromise = null;
const restartBrowserEvery = Number(TEST_RESTART_BROWSER_EVERY) || 0;
let runScriptCounterForRestart = 0;

const startTestServer = async () => {
    server = new TestingServer({
        listenHost: 'localhost',
        listenPort: Number(TEST_SERVER_PORT),
        extraListenPort: Number(TEST_SERVER_EXTRA_PORT),
        badTLSListenPort: Number(TEST_SERVER_BAD_TLS_PORT),
    });
    await server.start();
    return {listenPort: server.listenPort};
};

const startOpenrunner = async () => {
    assert.isString(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must be set');
    assert.isOk(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must not be empty');
    assert.isNull(openrunnerDisposer, 'openrunnerDisposer');

    const [buildCacheDirectory] = await buildCacheDisposer.promise();

    openrunnerDisposer = OpenrunnerClient.promiseDisposer({
        firefoxPath: TEST_FIREFOX_BIN,
        tempDirectory: TEST_TEMP_DIR,
        headless: !debugMode && TEST_HEADLESS === '1',
        cncPort,
        instrumentCoverage: Boolean(global.__coverage__),
        openDevtool: debugMode,
        buildCacheDirectory,
    });
};

const stopOpenrunner = async () => {
    await mergeCoverage();
    if (openrunnerDisposer) {
        try {
            await openrunnerDisposer.tryDispose();
        }
        catch (err) {
            log.error({err}, 'Stopping Openrunner failed');
        }
        openrunnerDisposer = null;
    }
};

const doStart = async () => {
    assert.isOk(TEST_TEMP_DIR, 'TEST_TEMP_DIR must not be empty');

    await fs.mkdirp(TEST_TEMP_DIR);
    cncPort = TEST_SERVER_CNC_PORT > 0 ? TEST_SERVER_CNC_PORT : await findFreeTCPPort();
    buildCacheDisposer = temporaryDirectory(TEST_TEMP_DIR, ['openrunner-build-cache-']);

    await Promise.all([
        startTestServer(),
        startOpenrunner(),
    ]);
};

const ensureStarted = async () => {
    if (!startPromise) {
        startPromise = doStart();
    }
    await startPromise;
    await openrunnerDisposer.promise();
};

const stop = async () => {
    await startPromise;

    if (debugMode) {
        return;
    }

    await stopOpenrunner();
    if (buildCacheDisposer) {
        try {
            await buildCacheDisposer.tryDispose();
        }
        catch (err) {
            log.error({err}, 'Cleaning up build cache failed');
        }
        buildCacheDisposer = null;
    }
    await server.stop();
};

const mergeCoverage = async () => {
    log.info('Gathering code coverage...');
    try {
        const myCoverage = global.__coverage__;
        if (!myCoverage) {
            return;
        }

        const openrunner = await openrunnerDisposer.promise();
        const extensionCoverage = await openrunner.reportCodeCoverage();
        mergeCoverageReports(myCoverage, extensionCoverage);
        log.debug('Merged code coverage report');
    }
    catch (err) {
        log.warn({err}, 'Failed to retrieve code coverage from the browser extension');
    }
};

const runScriptPrepare = async () => {
    await ensureStarted();
    ++runScriptCounterForRestart;
    if (
        !debugMode &&
        restartBrowserEvery > 0 &&
        runScriptCounterForRestart > restartBrowserEvery
    ) {
        log.info({restartBrowserEvery}, 'Restarting browser...');
        runScriptCounterForRestart = 0;

        await stopOpenrunner();
        await startOpenrunner();
    }
};

const runScript = async (scriptContent, stackFileName = 'integrationTest.js') => {
    await runScriptPrepare();
    const openrunner = await openrunnerDisposer.promise();
    return await openrunner.runScript({scriptContent, stackFileName});
};

const runScriptFromFunction = async (func, injected = {}) => {
    const stackFileName = (func.name || 'integrationTest') + 'js';
    const scriptContent =
        `const injected = ${JSON.stringify(injected)};` +
        func.toString().replace(/^async\s*\(\)\s*=>\s*{|}$/g, '');
    return await runScript(scriptContent, stackFileName);
};

module.exports = {
    start: ensureStarted,
    stop,
    runScript,
    runScriptFromFunction,
    testServerPort: () => server.listenPort,
    testServerBadTLSPort: () => server.badTLSListenPort,
};
