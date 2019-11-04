'use strict';
/* eslint-env node */
const {assert} = require('chai');
const fs = require('fs-extra');

const TestingServer = require('../server/TestingServer');
const {buildTempFirefoxProfile} = require('../../index');
const log = require('../../lib/logger')({hostname: 'test', MODULE: 'integrationTest'});
const {mergeCoverageReports} = require('../../lib/mergeCoverage');
const {startFirefox} = require('../../lib/node/firefoxProcess');
const {
    TEST_TEMP_DIR,
    TEST_FIREFOX_BIN,
    TEST_SERVER_PORT,
    TEST_SERVER_EXTRA_PORT,
    TEST_SERVER_BAD_TLS_PORT,
    TEST_HEADLESS,
    TEST_DEBUG,
    TEST_RESTART_BROWSER_EVERY,
} = require('./testEnv');

const debugMode = TEST_DEBUG === '1';
let firefoxProfileDisposer;
let firefoxProcessDisposer;
let server;
let startPromise;
let profilePath;
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

const startFirefoxProcess = async () => {
    assert.isString(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must be set');
    assert.isOk(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must not be empty');
    log.debug('Starting browser...');
    firefoxProcessDisposer = startFirefox({
        firefoxPath: [TEST_FIREFOX_BIN, '--jsconsole'],
        profilePath,
        headless: !debugMode && TEST_HEADLESS === '1',
        extraArgs: debugMode ? ['--jsconsole'] : [],
    });
    await firefoxProcessDisposer.promise();

    log.info('Waiting for C&C connection');
    await server.waitForActiveCnCConnection();
    log.info('Browser has been connected and is ready to run scripts');
};

const stopFirefoxProcess = async () => {
    await mergeCoverage();
    if (firefoxProcessDisposer) {
        try {
            await firefoxProcessDisposer.tryDispose();
        }
        catch (err) {
            log.error({err}, 'Stopping browser failed');
        }
        firefoxProcessDisposer = null;
    }
    log.debug('Closing any active connection...');
    await server.destroyActiveCnCConnection('Stopping!');
    log.debug('Successfully stopped the browser');
};

const doStart = async () => {
    assert.isOk(TEST_TEMP_DIR, 'TEST_TEMP_DIR must not be empty');

    await fs.mkdirp(TEST_TEMP_DIR);

    const {listenPort} = await startTestServer();

    const buildProfileOptions = {
        cncPort: listenPort,
        tempDirectory: TEST_TEMP_DIR,
        instrumentCoverage: Boolean(global.__coverage__),
    };
    log.info(buildProfileOptions, 'Building firefox profile...');
    firefoxProfileDisposer = buildTempFirefoxProfile(buildProfileOptions);
    profilePath = await firefoxProfileDisposer.promise();

    await startFirefoxProcess();
};

const ensureStarted = async () => {
    if (!startPromise) {
        startPromise = doStart();
    }
    await startPromise;
    await firefoxProcessDisposer.promise();
};

const stop = async () => {
    await startPromise;

    if (debugMode) {
        return;
    }

    await stopFirefoxProcess();
    if (firefoxProfileDisposer) {
        try {
            // bluebird will throw if tryDispose is called multiple times,
            // so make sure that firefoxProcessDisposer is always unset
            await firefoxProcessDisposer.tryDispose();
        }
        catch (err) {
            log.error({err}, 'Stopping browser failed');
        }
        firefoxProfileDisposer = null;
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

        const extensionCoverage = await server.reportCodeCoverage();
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

        await stopFirefoxProcess();
        await startFirefoxProcess();
    }
};

const runScript = async (scriptContent) => {
    await runScriptPrepare();
    return await server.runScript({scriptContent, stackFileName: 'integrationTest.js'});
};

const runScriptFromFunction = async (func, injected = {}) => {
    await runScriptPrepare();
    return await server.runScriptFromFunction(func, injected);
};

module.exports = {
    start: ensureStarted,
    stop,
    runScript,
    runScriptFromFunction,
    testServerPort: () => server.listenPort,
    testServerBadTLSPort: () => server.badTLSListenPort,
};
