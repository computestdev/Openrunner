'use strict';

const EventEmitter = require('events').EventEmitter;
const JSONBird = require('jsonbird');

const {SCRIPT_EXECUTION_TIMEOUT_ERROR} = require('../../../lib/scriptErrors');
const {addLogListener, removeLogListener} = require('../../../lib/logger');
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'core/background/RunnerScriptParent'});
const coreMethods = require('./coreMethods');
const loadModule = require('./loadModule');
const ModuleRegister = require('../../../lib/ModuleRegister');
const compileRunnerScript = require('./compileRunnerScript');
const {mergeCoverageReports} = require('../../../lib/mergeCoverage');
const {SCRIPT_ENV: SCRIPT_ENV_URL, SCRIPT_ENV_CONTENT: SCRIPT_ENV_CONTENT_URL} = require('../urls');
const ScriptWindow = require('./ScriptWindow');
const TabContentRPC = require('../../../lib/contentRpc/TabContentRPC');

const PRIVATE = Symbol('RunnerScriptParent private');

class RunnerScriptParent {
    constructor() {
        this[PRIVATE] = new RunnerScriptParentPrivate(this);
        Object.freeze(this);
    }

    get window() {
        return this[PRIVATE].window;
    }

    on(type, listener) {
        this[PRIVATE].on(type, listener);
    }

    once(type, listener) {
        this[PRIVATE].once(type, listener);
    }

    emit(type, message, args) {
        this[PRIVATE].emit(type, message, args);
    }

    off(type, listener) {
        this[PRIVATE].off(type, listener);
    }

    get runTimeout() {
        return this[PRIVATE].runTimeoutMs;
    }

    compileScript(content, stackFileName) {
        return this[PRIVATE].compileScript(content, stackFileName);
    }

    get scriptApiVersion() {
        return this[PRIVATE].scriptApiVersion;
    }

    async run() {
        return this[PRIVATE].run();
    }

    async stop(reason) {
        return this[PRIVATE].stop(reason);
    }

    async include(name) {
        return this[PRIVATE].include(name);
    }

    async rpcCall(...args) {
        return this[PRIVATE].rpcCall(...args);
    }

    rpcRegisterMethods(methods) {
        return this[PRIVATE].rpcRegisterMethods(methods);
    }

    async importScripts(...urls) {
        return this[PRIVATE].importScripts(...urls);
    }
}

class RunnerScriptParentPrivate {
    constructor(publicInterface) {
        this.publicInterface = publicInterface;
        this.runTimeoutMs = 60 * 1000;
        this.emitter = new EventEmitter();
        this.runActive = false;
        this.scriptContent = null;
        this.stackFileName = null;
        this.scriptApiVersion = null;
        this.sentStopCommand = false;
        this.workerTabRpc = null;
        this.workerTabRpcInstance = null;
        this.workerRpc = null;
        this.moduleRegister = new ModuleRegister();
        this.scriptTimeoutTimer = 0;
        this.window = new ScriptWindow({
            browserWindows: browser.windows,
            browserTabs: browser.tabs,
            browserWebNavigation: browser.webNavigation,
            browserContextualIdentities: browser.contextualIdentities,
        });
        Object.seal(this);
    }

    on(type, listener) {
        this.emitter.on(type, listener, null);
    }

    once(type, listener) {
        this.emitter.once(type, listener, null);
    }

    emit(type, ...args) {
        this.emitter.emit(type, ...args);
    }

    off(type, listener) {
        this.emitter.off(type, listener, null);
    }

    async rpcCall(...args) {
        return this.workerRpc.call(...args);
    }

    rpcRegisterMethods(methods) {
        this.workerRpc.methods(methods);
    }

    compileScript(scriptContent, stackFileName) {
        if (this.scriptContent) {
            throw Error('Script has already been compiled');
        }

        const {scriptCompiledContent, scriptApiVersion, runTimeoutMs} = compileRunnerScript(scriptContent);
        this.scriptContent = scriptCompiledContent;
        this.stackFileName = stackFileName;
        this.scriptApiVersion = scriptApiVersion;
        this.runTimeoutMs = runTimeoutMs;
    }

    async include(moduleName) {
        if (!this.moduleRegister.hasModule(moduleName)) {
            if (!ModuleRegister.isValidModuleName(moduleName)) {
                throw Error('include(): Invalid `moduleName`');
            }

            const promise = loadModule(this.publicInterface, moduleName);
            this.moduleRegister.registerModule(moduleName, promise);
        }
        return await this.moduleRegister.waitForModuleRegistration(moduleName);
    }

    async _createWorker(workerTabId) {
        if (this.workerTabRpc || this.workerTabRpcInstance || this.workerRpc) {
            throw Error('Invalid state');
        }

        const workerTabRpc = this.workerTabRpc = new TabContentRPC({
            browserRuntime: browser.runtime,
            browserTabs: browser.tabs,
            context: 'core/script-env-content',
            filterSender: tab => tab.id === workerTabId,
        });
        workerTabRpc.attach();
        const workerTabRpcInstance = this.workerTabRpcInstance = workerTabRpc.get(workerTabId, 0);

        const waitForContentInit = new Promise(resolve => workerTabRpcInstance.method('initialized', resolve));
        log.debug({workerTabId, SCRIPT_ENV_CONTENT_URL}, 'Executing script-env-content script...');
        browser.tabs.executeScript(workerTabId, {
            allFrames: false,
            frameId: 0,
            file: SCRIPT_ENV_CONTENT_URL,
            runAt: 'document_start',
        });

        log.debug({workerTabId, SCRIPT_ENV_CONTENT_URL}, 'Waiting for script-env-content to be initialized...');
        await waitForContentInit;

        const workerRpc = this.workerRpc = new JSONBird({
            // take advantage of the structured clone algorithm
            readableMode: 'object',
            writableMode: 'object',
            receiveErrorStack: true,
            sendErrorStack: true,
            defaultTimeout: 15001,
            pingMethod: 'ping',
        });
        workerTabRpcInstance.method('workerMessage', object => workerRpc.write(object));
        workerRpc.on('data', object => workerTabRpcInstance.call('workerPostMessage', object));
        workerRpc.on('error', err => log.error({err}, 'Uncaught error in script-env RPC'));
        workerRpc.on('protocolError', err => log.error({err}, 'Protocol error in script-env RPC'));

        log.debug({workerTabId, SCRIPT_ENV_URL}, 'Creating Web Worker...');
        await workerTabRpcInstance.call('workerCreate', {url: SCRIPT_ENV_URL});
    }

    async run() {
        if (!this.scriptContent) {
            throw Error('Script must be compiled first (compileScript())');
        }

        if (this.runActive) {
            throw Error('A run is already in progress');
        }

        let dropLogMessages = false;
        const logMessages = [];
        const logListener = obj => {
            if (dropLogMessages) {
                return;
            }

            if (logMessages.length >= 1000) {
                dropLogMessages = true;
                logMessages.push({
                    v: 0,
                    hostname: 'background',
                    pid: 0,
                    level: 60,
                    name: 'Openrunner',
                    time: new Date().toISOString(),
                    msg: 'Too many log lines, all further log lines will be dropped.',
                });
            }
            else {
                logMessages.push(obj);
            }
        };

        this.runActive = true; // set this to true before doing anything async, so that this function can not be invoked in parallel
        try {
            addLogListener(logListener);
            this.window.attach();
            await this.window.open();
            // The Openrunner script itself runs inside a Web Worker, which is created from a special tab pointing to our blank.html,
            // this tab runs in the same cookie store (contextual identity) as the tabs created by the script.
            // This ensures that using fetch() in the global scope of the Openrunner script does not pollute the global cookie
            // store (and thus, persists between script runs)
            const workerTabId = await this.window.getBlankExtensionPageTabId();
            await this._createWorker(workerTabId);

            this.sentStopCommand = false;

            this.rpcRegisterMethods(coreMethods(this.publicInterface));

            // a quick ping to make sure that our Worker script is alive (throws if not)
            await this.rpcCall({name: 'ping', timeout: 1001});

            const {runTimeoutMs, stackFileName} = this;
            await this.rpcCall(
                {
                    name: 'core.compileScript',
                    timeout: 10002,
                },
                {
                    runTimeout: runTimeoutMs,
                    scriptContent: this.scriptContent,
                    stackFileName,
                    scriptApiVersion: this.scriptApiVersion,
                },
            );

            this.scriptTimeoutTimer = setTimeout(() => {
                this.scriptTimeoutTimer = 0;
                this.stop({
                    name: SCRIPT_EXECUTION_TIMEOUT_ERROR,
                    message: `Script execution timed out after ${runTimeoutMs / 1000} seconds`,
                })
                .catch(err => log.error({err}, 'Stopping script (after script timeout) failed'));
            }, runTimeoutMs);

            await this.emitBeforeRunStart();
            const {scriptResult} = await this.include('runResult');
            let runScriptResult = null;
            try {
                log.debug({runTimeoutMs, stackFileName}, 'Sending runScript command...');
                scriptResult.timing.beginNow();
                runScriptResult = await this.rpcCall(
                    {
                        name: 'core.runScript',
                        // note: if this timeout hits, the result log will be fairly empty, it is only used as a last resort:
                        timeout: runTimeoutMs + 30000,
                    },
                    {},
                );
                await this.emitRunScriptResult(runScriptResult);
                scriptResult.timing.endNow();
                log.info({err: runScriptResult.scriptError}, 'Worker completed runScript command');
                await this.stop({message: 'Normal script completion'});
            }
            finally { // only emit runEnd if runStart was emitted
                // eslint-disable-next-line camelcase, no-undef
                const myCoverage = typeof __runner_coverage__ === 'object' && __runner_coverage__;
                if (myCoverage) {
                    const scriptEnvCoverage = await this.rpcCall({timeout: 4001, name: 'core.reportCodeCoverage'});
                    mergeCoverageReports(myCoverage, scriptEnvCoverage);
                }

                await this.emitRunEnd();
                await this.cleanup();
            }
            log.info('Script is now stopped, serializing the script run result');

            return {
                error: runScriptResult.scriptError,
                value: runScriptResult.scriptValue,
                result: scriptResult.toJSONObject({scriptFileName: this.stackFileName}),
                log: logMessages,
            };
        }
        finally {
            removeLogListener(logListener);
            await this.cleanup();
            this.runActive = false;
        }
    }

    async cleanup() {
        clearTimeout(this.scriptTimeoutTimer);
        this.scriptTimeoutTimer = 0;

        if (this.workerRpc) {
            this.workerRpc.removeAllListeners('data');
        }
        this.workerRpc = null;

        if (this.workerTabRpcInstance) {
            await this.workerTabRpcInstance.call('workerTerminate', {timeout: 4002})
            .catch(err => log.error({err}, 'Error while terminating worker'));
        }

        if (this.workerTabRpc) {
            this.workerTabRpc.detach();
        }
        this.workerTabRpc = null;
        this.workerTabRpcInstance = null;

        if (this.window) {
            await this.window.close().catch(err => log.error({err}, 'Error while closing window'));
            this.window.detach();
        }
        this.window = null;
    }

    async stop({name, message} = {}) {
        if (this.sentStopCommand) {
            return false;
        }

        this.sentStopCommand = true;

        await this.rpcCall('core.stopScript', {
            reason: {name, message},
        });
        return true;
    }

    async importScripts(...urls) {
        await this.rpcCall('core.importScripts', ...urls);
    }

    async emitRunScriptResult(runScriptResult) {
        const promises = [];
        this.emit(
            'core.runScriptResult',
            promise => promises.push(
                promise.catch(err => {
                    log.error({err}, 'Uncaught error while emitting "core.runScriptResult" event');
                    throw err;
                }),
            ),
            runScriptResult,
        );
        await Promise.all(promises); // may reject
    }

    async emitBeforeRunStart() {
        const promises = [];
        this.emit('core.beforeRunStart', promise =>
            promises.push(
                promise.catch(err => {
                    log.error({err}, 'Uncaught error while emitting "core.beforeRunStart" event');
                    throw err;
                }),
            ),
        );
        await Promise.all(promises); // may reject
    }

    async emitRunEnd() {
        const beforePromises = [];
        this.emit('core.beforeRunEnd', promise =>
            beforePromises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "core.beforeRunEnd" event')),
            ),
        );
        await Promise.all(beforePromises); // should never reject

        const promises = [];
        this.emit('core.runEnd', promise =>
            promises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "core.runEnd" event')),
            ),
        );
        await Promise.all(promises); // should never reject
    }
}

module.exports = RunnerScriptParent;
