'use strict';
const {assert} = require('chai');
const {tmpdir} = require('os');
const Promise = require('bluebird');

const CnCServer = require('./CnCServer');
const {
    buildCachedFirefoxProfile,
    buildCachedFirefoxExtensionDirectory,
    buildTempFirefoxProfile,
    buildTempFirefoxExtensionDirectory,
    copyFirefoxToTemp,
} = require('../../building');
const {resolveFullFirefoxPath, startFirefox} = require('../../lib/node/firefoxProcess');
const log = require('../logger')({MODULE: 'node/OpenrunnerClient'});

const PRIVATE = Symbol('OpenrunnerClient PRIVATE');

const STATE = Object.freeze({
    STOPPED: 0,
    STOPPING: 1,
    STARTING: 2,
    STARTED: 3,
});

class OpenrunnerClient {
    constructor({
        firefoxPath,
        tempDirectory = tmpdir(),
        preloadExtension = false,
        headless = true,
        cncPort = 17011,
        instrumentCoverage = false,
        buildCacheDirectory = null,
        openDevtool = false,
        proxy = {},
        certificatePaths = null,
    }) {
        assert.isString(firefoxPath, 'OpenrunnerClient: options.firefoxPath');
        assert.isString(tempDirectory, 'OpenrunnerClient: options.tempDirectory');
        assert.isBoolean(preloadExtension, 'OpenrunnerClient: options.preloadExtension');
        assert.isBoolean(headless, 'OpenrunnerClient: options.headless');
        assert(Number.isInteger(cncPort), 'OpenrunnerClient: options.cncPort must be an integer number');
        assert(cncPort >= 0 && cncPort < 2 ** 16, 'OpenrunnerClient: options.cncPort must be a valid TCP port number');
        assert.isBoolean(instrumentCoverage, 'OpenrunnerClient: options.instrumentCoverage');
        assert.isBoolean(openDevtool, 'OpenrunnerClient: options.openDevtool');
        assert(
            buildCacheDirectory === null || typeof buildCacheDirectory === 'string',
            'OpenrunnerClient: options.buildCacheDirectory must be null or a string',
        );

        // cncPort=0 means that the OS will pick any unused one. And since we have to hard code
        // the cncPort into the profile, the cache would be useless
        assert(
            buildCacheDirectory === null || cncPort > 0,
            'OpenrunnerClient: options.buildCacheDirectory must not be set if options.cncPort is 0',
        );
        assert.isObject(proxy, 'options.proxy');
        for (const prop of ['http', 'https']) {
            if (proxy[prop]) {
                assert.isObject(proxy[prop], `options.proxy.${prop}`);
                assert.isString(proxy[prop].host, `options.proxy.${prop}.host`);
                assert.isFinite(proxy[prop].port, `options.proxy.${prop}.port`);
            }
        }

        if (certificatePaths !== null) {
            assert(Array.isArray(certificatePaths), 'OpenrunnerClient: options.certificatePaths should be an array or null');
            assert.isAtLeast(certificatePaths.length, 1, 'OpenrunnerClient: options.certificatePaths should contain at least one item');
            for (const item of certificatePaths) {
                assert.isString(item, 'OpenrunnerClient: options.certificatePaths should be an array of strings');
            }
        }

        this.firefoxPath = firefoxPath;
        this.tempDirectory = tempDirectory;
        this.preloadExtension = preloadExtension;
        this.headless = headless;
        this.cncPort = cncPort;
        this.instrumentCoverage = instrumentCoverage;
        this.buildCacheDirectory = buildCacheDirectory;
        this.openDevtool = openDevtool;
        this.proxyConfig = proxy;
        this.certificatePaths = certificatePaths;
        const priv = Object.seal({
            state: STATE.STOPPED,
            cncServer: null,
            firefoxProcess: null,
            disposers: null,
            dispose: async (disposer) => {
                priv.disposers.push(disposer);
                return await disposer.promise();
            },
        });
        this[PRIVATE] = priv;
        Object.freeze(this);
    }

    async start() {
        const {firefoxPath, buildCacheDirectory, preloadExtension, tempDirectory, instrumentCoverage, headless, certificatePaths} = this;
        const priv = this[PRIVATE];
        assert(priv.state === STATE.STOPPED, 'OpenrunnerClient#start(): Invalid state');

        log.debug(
            {firefoxPath, buildCacheDirectory, preloadExtension, tempDirectory, instrumentCoverage, headless},
            'Starting Openrunner...',
        );
        priv.state = STATE.STARTING;
        try {
            priv.disposers = [];
            const cncServer = priv.cncServer = await priv.dispose(CnCServer.promiseDisposer(this.cncPort));
            const effectiveCnCPort = cncServer.listenPort;

            const extensionOptions = {
                cncPort: effectiveCnCPort,
                instrumentCoverage,
            };

            let profilePath = null;
            let extensionPath = null;
            const proxy = {
                ...this.proxyConfig,
                // do not pass the C&C connection through the proxy
                exclude: [`localhost:${effectiveCnCPort}`],
            };

            const fullFirefoxSourcePath = await resolveFullFirefoxPath(firefoxPath);
            let fullFirefoxPath = fullFirefoxSourcePath;
            const shouldCopyFirefox = Boolean(certificatePaths);

            if (shouldCopyFirefox) {
                const policyOptions = {
                    certificatePaths,
                };

                log.debug({fullFirefoxSourcePath, policyOptions}, 'Copying firefox...');
                const {fullFirefoxDestinationPath} = await priv.dispose(copyFirefoxToTemp({
                    tempDirectory,
                    fullFirefoxPath: fullFirefoxSourcePath,
                    policyOptions,
                }));

                fullFirefoxPath = fullFirefoxDestinationPath;
                log.debug({fullFirefoxPath}, 'Copied firefox');
            }

            if (buildCacheDirectory && preloadExtension) {
                profilePath = await buildCachedFirefoxProfile({
                    tempDirectory,
                    preloadExtension: true,
                    extensionOptions,
                    buildCacheDirectory,
                    proxy,
                });
            }
            else if (buildCacheDirectory && !preloadExtension) {
                profilePath = await buildCachedFirefoxProfile({
                    tempDirectory,
                    preloadExtension: false,
                    buildCacheDirectory,
                    proxy,
                });
                extensionPath = await buildCachedFirefoxExtensionDirectory({
                    tempDirectory,
                    extensionOptions,
                    buildCacheDirectory,
                });
            }
            else if (!buildCacheDirectory && preloadExtension) {
                profilePath = await priv.dispose(buildTempFirefoxProfile({
                    tempDirectory,
                    preloadExtension: true,
                    extensionOptions,
                    proxy,
                }));
            }
            else /* if (!buildCacheDirectory && !preloadExtension) */ {
                profilePath = await priv.dispose(buildTempFirefoxProfile({
                    tempDirectory,
                    preloadExtension: false,
                    proxy,
                }));
                extensionPath = await priv.dispose(buildTempFirefoxExtensionDirectory({
                    tempDirectory,
                    extensionOptions,
                }));
            }

            const {firefoxProcess, debuggingClient} = await priv.dispose(startFirefox({
                fullFirefoxPath,
                headless,
                profilePath,
                debugging: Boolean(extensionPath),
                extraArgs: this.openDevtool
                    ? ['about:devtools-toolbox?type=extension&id=openrunner%40computest.nl']
                    : [],
            }));
            priv.firefoxProcess = firefoxProcess;

            if (extensionPath) {
                await debuggingClient.installAddon(extensionPath);
            }

            log.debug('Waiting for C&C connection...');
            await cncServer.waitForActiveConnection();

            priv.state = STATE.STARTED;
            log.debug('Started Openrunner!');
        }
        catch (err) {
            priv.state = STATE.STOPPED;
            throw err;
        }
    }

    async stop() {
        const priv = this[PRIVATE];
        assert(priv.state === STATE.STARTED, 'OpenrunnerClient#stop(): Invalid state');

        log.debug('Stopping Openrunner...');
        priv.state = STATE.STOPPING;
        const errors = [];
        for (const disposer of [...priv.disposers].reverse()) {
            try {
                await disposer.tryDispose();
            }
            catch (err) {
                errors.push(err);
                log.warn({err}, 'Error while stopping');
            }
        }
        priv.disposers = null;
        priv.cncServer = null;
        priv.firefoxProcess = null;
        priv.state = STATE.STOPPED;
        log.debug({errors: errors.length}, 'Stopped Openrunner...');

        if (errors.length > 0) {
            const err = Error(`OpenrunnerClient#stop(): One or more errors while stopping: ${errors.map(e => e.message).join(', ')}`);
            err.data = {errors};
        }
    }

    async waitForChildStop() {
        const priv = this[PRIVATE];
        assert(priv.state === STATE.STARTED, 'OpenrunnerClient#stop(): Invalid state');
        await priv.firefoxProcess.waitForChildStop();
    }

    async runScript({scriptContent, stackFileName}) {
        const priv = this[PRIVATE];
        assert(priv.state === STATE.STARTED, 'OpenrunnerClient#runScript(): Invalid state');

        log.info({stackFileName, scriptContentLength: scriptContent.length}, 'Sending runScript command...');
        return await priv.cncServer.runScript({scriptContent, stackFileName});
    }

    async reportCodeCoverage() {
        const priv = this[PRIVATE];
        assert(priv.state === STATE.STARTED, 'OpenrunnerClient#runScript(): Invalid state');
        return await priv.cncServer.reportCodeCoverage();
    }
}

OpenrunnerClient.promiseDisposer = options => Promise.try(async () => {
    const openrunner = new OpenrunnerClient(options);
    await openrunner.start();
    return openrunner;
})
.disposer(async openrunner => {
    await openrunner.stop();
});

module.exports = OpenrunnerClient;
