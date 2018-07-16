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
    TEST_SERVER_BAD_TLS_PORT,
    TEST_HEADLESS,
    TEST_DEBUG,
} = require('./testEnv');

const debugMode = TEST_DEBUG === '1';
let firefoxProfileDisposer;
let firefoxProcessDisposer;
let server;
let startPromise;

const startTestServer = async () => {
    server = new TestingServer({
        listenHost: 'localhost',
        listenPort: Number(TEST_SERVER_PORT),
        badTLSListenPort: Number(TEST_SERVER_BAD_TLS_PORT),
    });
    await server.start();
    return {listenPort: server.listenPort};
};

const doStart = async () => {
    assert.isString(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must be set');
    assert.isOk(TEST_FIREFOX_BIN, 'TEST_FIREFOX_BIN must not be empty');
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

    const profilePath = await firefoxProfileDisposer.promise();
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

const start = async () => {
    if (!startPromise) {
        startPromise = doStart();
    }
    await startPromise;
};

const stop = async () => {
    await startPromise;
    await mergeCoverage();

    if (debugMode) {
        return;
    }

    if (firefoxProcessDisposer) {
        await firefoxProcessDisposer.tryDispose();
        firefoxProcessDisposer = null;
    }
    if (firefoxProfileDisposer) {
        await firefoxProfileDisposer.tryDispose();
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
    }
    catch (err) {
        log.warn({err}, 'Failed to retrieve code coverage from the browser extension');
    }
};

const runScript = async (scriptContent) => {
    await start();
    return await server.runScript({scriptContent, stackFileName: 'integrationTest.js'});
};

const runScriptFromFunction = async (func, injected = {}) => {
    await start();
    return await server.runScriptFromFunction(func, injected);
};

module.exports = {
    start,
    stop,
    runScript,
    runScriptFromFunction,
    testServerPort: () => server.listenPort,
    testServerBadTLSPort: () => server.badTLSListenPort,
};
