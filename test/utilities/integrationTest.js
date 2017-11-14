'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const {assert} = require('chai');

const Process = require('./Process');
const TestingServer = require('../server/TestingServer');
const {buildFirefoxProfile, buildSources} = require('../../index');
const log = require('../../lib/logger')({hostname: 'test', MODULE: 'integrationTest'});
const {mergeCoverageReports} = require('../../lib/mergeCoverage');

const {
    TEST_FIREFOX_BIN,
    TEST_FIREFOX_PROFILE = resolvePath(__dirname, '..', '..', 'PRIV', 'test-profile'),
    TEST_BUILD_OUTPUT = resolvePath(__dirname, '..', '..', 'PRIV', 'test-build'),
    TEST_SERVER_PORT = '0', // 0 = pick a random free port
} = process.env;

let firefoxProcess;
let server;
let startPromise;

const startTestServer = async () => {
    server = new TestingServer({
        listenHost: 'localhost',
        listenPort: Number(TEST_SERVER_PORT),
    });
    await server.start();
    return {listenPort: server.listenPort};
};

const startFirefox = async () => {
    firefoxProcess = new Process({
        executablePath: TEST_FIREFOX_BIN,
        args: [
            '--no-remote',
            '--profile',
            TEST_FIREFOX_PROFILE,
        ],
    });
    await firefoxProcess.ensureStarted();
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

    log.info({executablePath: TEST_FIREFOX_BIN}, 'Starting firefox...');
    await startFirefox();

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

    log.info('Stopping firefox...');
    await firefoxProcess.stop();
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

const runScriptFromFunction = async (func, injected = {}) => {
    await start();
    return await server.runScriptFromFunction(func, injected);
};

module.exports = {
    start,
    stop,
    runScriptFromFunction,
    testServerPort: () => server.listenPort,
};
