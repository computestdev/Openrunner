'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const {assert} = require('chai');

const TestingServer = require('../server/TestingServer');
const {buildFirefoxProfile, buildSources} = require('../../index');
const log = require('../../lib/logger')({hostname: 'test', MODULE: 'integrationTest'});
const {mergeCoverageReports} = require('../../lib/mergeCoverage');
const {startFirefox} = require('../../lib/node/firefoxProcess');

const {
    TEST_FIREFOX_BIN,
    TEST_FIREFOX_PROFILE = resolvePath(__dirname, '..', '..', 'PRIV', 'test-profile'),
    TEST_BUILD_OUTPUT = resolvePath(__dirname, '..', '..', 'PRIV', 'test-build'),
    TEST_SERVER_PORT = '0', // 0 = pick a random free port
    TEST_SERVER_BAD_TLS_PORT = '0', // 0 = pick a random free port
} = process.env;

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
    assert.isOk(TEST_FIREFOX_PROFILE, 'TEST_FIREFOX_PROFILE must not be empty');
    assert.isOk(TEST_BUILD_OUTPUT, 'TEST_BUILD_OUTPUT must not be empty');

    const {listenPort} = await startTestServer();

    const buildSourceOptions = {
        outputPath: TEST_BUILD_OUTPUT,
        cncPort: listenPort,
        instrumentCoverage: Boolean(global.__coverage__),
    };
    log.info(buildSourceOptions, 'Building sources...');
    await buildSources(buildSourceOptions);

    const buildProfileOptions = {
        sourceBuildInput: TEST_BUILD_OUTPUT,
        outputPath: TEST_FIREFOX_PROFILE,
    };
    log.info(buildProfileOptions, 'Building firefox profile...');
    await buildFirefoxProfile(buildProfileOptions);
    firefoxProcessDisposer = startFirefox({firefoxPath: TEST_FIREFOX_BIN, profilePath: TEST_FIREFOX_PROFILE});
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

    if (firefoxProcessDisposer) {
        await firefoxProcessDisposer.tryDispose();
        firefoxProcessDisposer = null;
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
