'use strict';
const JSONBird = require('jsonbird');
const EventEmitter = require('events').EventEmitter;

const log = require('../../../lib/logger')({hostname: 'script-env', MODULE: 'core/script-env/RunnerScript'});
const coreMethods = require('./coreMethods');
const compileRunnerScript = require('./compileRunnerScript');
const constructGlobalFunctions = require('./globalFunctions');
const {resolveScriptEnvEvalStack, scriptErrorToObject, replaceMagicScriptNames} = require('../../../lib/errorParsing');
const ModuleRegister = require('../../../lib/ModuleRegister');

const PRIVATE = Symbol('RunnerScript private');

class RunnerScript {
    constructor() {
        this[PRIVATE] = new RunnerScriptPrivate(this);
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

    attach(workerPort) {
        return this[PRIVATE].attach(workerPort);
    }

    async rpcCall(...args) {
        return this[PRIVATE].rpcCall(...args);
    }

    rpcRegisterMethods(methods) {
        return this[PRIVATE].rpcRegisterMethods(methods);
    }

    registerModule(name, promise) {
        return this[PRIVATE].registerModule(name, promise);
    }

    async include(name) {
        return this[PRIVATE].include(name);
    }

    async stop(reason) {
        await this[PRIVATE].stop(reason);
    }

    compileScript(scriptContent, stackFileName, scriptApiVersion) {
        this[PRIVATE].compileScript(scriptContent, stackFileName, scriptApiVersion);
    }

    get compiled() {
        return this[PRIVATE].compiled;
    }

    get scriptApiVersion() {
        return this[PRIVATE].scriptApiVersion;
    }

    async run() {
        return await this[PRIVATE].run();
    }
}

class RunnerScriptPrivate {
    constructor(publicInterface) {
        this.publicInterface = publicInterface;
        this.emitter = new EventEmitter();
        this.rpc = new JSONBird({
            readableMode: 'object',
            writableMode: 'object',
            receiveErrorStack: true,
            sendErrorStack: true,
            pingMethod: 'ping',
            defaultTimeout: 15002,
        });
        this.rpcRegisterMethods(coreMethods(this.publicInterface));
        this.attached = false;
        this.compiled = false;
        this.scriptFunction = null;
        this.stackFileName = null;
        this.scriptApiVersion = null;
        this.moduleRegister = new ModuleRegister();
        this.stopReason = null;
        this.stopPromise = new Promise((resolve, reject) => {
            this.stopPromiseReject = reject;
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

    attach(workerPort) {
        if (this.attached) {
            throw Error('Already attached');
        }

        this.attached = true;
        const {rpc} = this;
        workerPort.onmessage = e => rpc.write(e.data);
        rpc.on('data', object => workerPort.postMessage(object));
        rpc.on('error', err => log.error({err}, 'Uncaught error in script-env RPC'));
        rpc.on('protocolError', err => log.error({err}, 'Protocol error in script-env RPC'));
    }

    async rpcCall(...args) {
        return this.rpc.call(...args);
    }

    rpcRegisterMethods(methods) {
        this.rpc.methods(methods);
    }

    registerModule(name, promise) {
        this.moduleRegister.registerModule(name, promise);
    }

    async emitRunEnd() {
        const reason = this.stopReason;
        log.info({err: reason}, 'Emitting core.beforeRunEnd...');

        const beforePromises = [];
        this.emit('core.beforeRunEnd',
            promise => beforePromises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "beforeRunEnd" event')),
            ),
            reason,
        );
        await Promise.all(beforePromises); // should never reject

        log.info('Emitted core.beforeRunEnd; Emitting core.runEnd...');

        const promises = [];
        this.emit('core.runEnd',
            promise => promises.push(
                promise.catch(err => log.error({err}, 'Uncaught error while emitting "endRun" event')),
            ),
            reason,
        );
        await Promise.all(promises); // should never reject

        log.info('Emitted core.runEnd...');
    }

    async stop({name = 'Error', message = ''}) {
        log.info({errorName: name, message}, 'Stopping...');
        const err = new Error(`Script stopped: ${message}`);
        err.name = name;
        this.stopReason = err;
        this.stopPromiseReject(err);
    }

    compileScript(scriptContent, stackFileName, scriptApiVersion) {
        this.scriptFunction = compileRunnerScript(scriptContent);
        this.stackFileName = stackFileName;
        this.scriptApiVersion = scriptApiVersion;
        this.compiled = true;
    }

    async include(name) {
        if (!this.moduleRegister.hasModule(name)) {
            await this.rpcCall('core.include', name);
        }
        return await this.moduleRegister.waitForModuleRegistration(name);
    }

    async run() {
        const {scriptFunction, stackFileName} = this;
        log.info({stackFileName}, 'Starting script run...');

        const globalFunctions = await constructGlobalFunctions(this);
        const args = [
            globalFunctions.include,
            globalFunctions.transaction,
        ];

        let scriptError = null;
        let scriptValue = null;
        try {
            scriptValue = await Promise.race([
                scriptFunction(...args),
                this.stopPromise,
            ]);
        }
        catch (err) {
            err.stack = resolveScriptEnvEvalStack(err.stack);
            log.info({err}, 'Uncaught error during script run');
            scriptError = scriptErrorToObject(err);
            replaceMagicScriptNames(scriptError, stackFileName);
        }

        await this.emitRunEnd();

        return {scriptError, scriptValue};
    }
}

module.exports = RunnerScript;
