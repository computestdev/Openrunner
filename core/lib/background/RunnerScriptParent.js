'use strict';

const EventEmitter = require('events').EventEmitter;
const JSONBird = require('jsonbird');

const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'core/background/RunnerScriptParent'});
const coreMethods = require('./coreMethods');
const loadModule = require('./loadModule');
const ModuleRegister = require('../../../lib/ModuleRegister');
const compileRunnerScript = require('./compileRunnerScript');
const {mergeCoverageReports} = require('../../../lib/mergeCoverage');

const scriptEnvUrl = browser.extension.getURL('/build/script-env.js');
const PRIVATE = Symbol('RunnerScriptParent private');

class RunnerScriptParent {
    constructor() {
        this[PRIVATE] = new RunnerScriptParentPrivate(this);
        Object.freeze(this);
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

    async run() {
        return this[PRIVATE].run();
    }

    async stop(reason = 'unknown') {
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
        this.worker = null;
        this.rpc = null;
        this.moduleRegister = new ModuleRegister();
        this.scriptTimeoutTimer = 0;
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
        return this.rpc.call(...args);
    }

    rpcRegisterMethods(methods) {
        this.rpc.methods(methods);
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

    async run() {
        if (!this.scriptContent) {
            throw Error('Script must be compiled first (compileScript())');
        }

        if (this.runActive) {
            throw Error('A run is already in progress');
        }

        this.runActive = true; // set this to true before doing anything async, so that this function can not be invoked in parallel
        try {
            log.debug({scriptEnvUrl}, 'Creating Web Worker...');
            const worker = new Worker(scriptEnvUrl, {name: 'Openrunner script environment'});
            const rpc = new JSONBird({
                // take advantage of the structured clone algorithm
                readableMode: 'object',
                writableMode: 'object',
                receiveErrorStack: true,
                sendErrorStack: true,
                defaultTimeout: 15001,
                pingMethod: 'ping',
            });
            worker.onmessage = e => rpc.write(e.data);
            rpc.on('data', object => worker.postMessage(object));
            rpc.on('error', err => log.error({err}, 'Uncaught error in script-env RPC'));
            rpc.on('protocolError', err => log.error({err}, 'Protocol error in script-env RPC'));

            this.sentStopCommand = false;
            this.worker = worker;
            this.rpc = rpc;

            this.rpcRegisterMethods(coreMethods(this.publicInterface));

            // a quick ping to make sure that our Worker script is alive (throws if not)
            await this.rpcCall({name: 'ping', timeout: 1001});

            const {runTimeoutMs, stackFileName} = this;
            this.scriptTimeoutTimer = setTimeout(() => {
                this.scriptTimeoutTimer = 0;
                this.stop(`Script execution timed out after ${runTimeoutMs / 1000} seconds`)
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
                    {
                        runTimeout: runTimeoutMs,
                        scriptContent: this.scriptContent,
                        stackFileName,
                    }
                );
                await this.emitRunScriptResult(runScriptResult);
                scriptResult.timing.endNow();
                log.info({err: runScriptResult.scriptError}, 'Worker completed runScript command');
                await this.stop('Normal script completion');
            }
            finally { // only emit runEnd if runStart was emitted
                // eslint-disable-next-line camelcase, no-undef
                const myCoverage = typeof __runner_coverage__ === 'object' && __runner_coverage__;
                if (myCoverage) {
                    const scriptEnvCoverage = await this.rpcCall({timeout: 4001, name: 'core.reportCodeCoverage'});
                    mergeCoverageReports(myCoverage, scriptEnvCoverage);
                }

                this.cleanup();
                await this.emitRunEnd();
            }
            log.info('Script is now stopped, serializing the script run result');

            return {
                error: runScriptResult.scriptError,
                value: runScriptResult.scriptValue,
                result: scriptResult.toJSONObject({scriptFileName: this.stackFileName}),
            };
        }
        finally {
            this.runActive = false;
            this.cleanup();
        }
    }

    cleanup() {
        clearTimeout(this.scriptTimeoutTimer);
        this.scriptTimeoutTimer = 0;

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        if (this.rpc) {
            this.rpc.removeAllListeners('data');
            this.rpc = null;
        }
    }

    async stop(reason) {
        if (this.sentStopCommand) {
            return false;
        }

        this.sentStopCommand = true;

        await this.rpcCall('core.stopScript', {
            reason: reason,
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
                })
            ),
            runScriptResult
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
                })
            )
        );
        await Promise.all(promises); // may reject
    }

    async emitRunEnd() {
        const beforePromises = [];
        this.emit('core.beforeRunEnd', promise =>
            beforePromises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "core.beforeRunEnd" event'))
            )
        );
        await Promise.all(beforePromises); // should never reject

        const promises = [];
        this.emit('core.runEnd', promise =>
            promises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "core.runEnd" event'))
            )
        );
        await Promise.all(promises); // should never reject
    }
}

module.exports = RunnerScriptParent;
