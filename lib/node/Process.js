'use strict';
/* eslint-env node */
const Promise = require('bluebird');
const EventEmitter = require('events');
const {spawn, execFile} = require('child_process');
const split = require('split');
const {assert} = require('chai');

const log = require('../logger')({MODULE: 'node/Process'});
const explicitPromise = require('../explicitPromise');

const isWindows = process.platform === 'win32';

/**
 * Launch a system process (requires node.js) and manage its lifecycle and standard streams.
 */
class Process extends EventEmitter {
    constructor({
        executablePath,
        args,
        env,
        cwd,
        enableExtraFd,
        outputFilter = s => s,
        killTimeout = 10000,
        killTree = false,
    }) {
        if (killTree && !isWindows) {
            throw Error('Process: options.killTree is only implemented for windows');
        }

        super();
        this.executablePath = executablePath;
        this.args = args || [];
        this.env = env || {};
        this.cwd = cwd || undefined; // undefined = inherit
        this.enableExtraFd = Boolean(enableExtraFd || false);
        this.outputFilter = outputFilter;
        this.killTimeout = killTimeout;
        this.killTree = killTree;

        this.runningChild = null;
        this.lastProcessStart = NaN;
        this.lastProcessExit = NaN;
        this.processExitCount = 0;
        this._childLifeTime = Promise.resolve();
    }

    _waitableEmit(event, ...args) {
        const waits = [];
        this.emit(event, ...args, p => waits.push(typeof p === 'function' ? p() : p));
        return Promise.all(waits);
    }

    get isRunning() {
        return Boolean(this.runningChild && this.runningChild.childProcess && !this.runningChild.stopping);
    }

    async ensureStarted() {
        if (this.runningChild && this.runningChild.stopping) {
            await this.stop(); // wait until the process has really been stopped
        }

        if (!this.runningChild) {
            await this.start();
        }
    }

    async start() {
        assert.isNotOk(this.runningChild, 'start(): The child process has already been started');

        const [lifeTimePromise, lifeTimeResolve] = explicitPromise();
        this._childLifeTime = lifeTimePromise.then(async (reason) => {
            this.runningChild = null;
            await this._waitableEmit('stopped', reason);
            log.info('Process stopped');
            this.emit('afterStopped', reason);
        });

        // set this value right away to make sure that we never create duplicate processes
        this.runningChild = {childProcess: null, stopping: false};

        try {
            await this._waitableEmit('beforeStart');
            // (beforeStart is allowed to modify the args/env)

            const args = [...this.args];
            let {executablePath} = this;

            if (Array.isArray(this.executablePath)) {
                // e.g. firefoxBinary = ['/usr/bin/env', 'firefox']
                executablePath = this.executablePath[0];
                args.unshift(...this.executablePath.slice(1));
            }

            // stdin, stdout, stderr, 3
            const stdio = ['ignore', 'pipe', 'pipe'];

            if (this.enableExtraFd) {
                stdio.push('pipe');
            }

            log.info({args, executablePath}, 'Starting process...');
            this.lastProcessStart = Date.now();
            const childProcess = spawn(
                executablePath,
                args,
                {
                    cwd: this.cwd,
                    encoding: 'utf8',
                    env: Object.assign({}, process.env, this.env),
                    shell: false,
                    stdio,
                },
            );

            const exitStatus = Object.seal({
                exitEvent: null,
                stdoutEnded: false,
                stderrEnded: false,
                handledExit: false,
            });

            const maybeHandleExit = () => {
                const {exitEvent} = exitStatus;
                if (exitEvent && exitStatus.stdoutEnded && exitStatus.stderrEnded && !exitStatus.handledExit) {
                    log.info({args, childPid, executablePath}, 'Process & standard streams have ended');
                    exitStatus.handledExit = true;

                    this.lastProcessExit = Date.now();
                    ++this.processExitCount;
                    lifeTimeResolve(Object.freeze({
                        error: null,
                        code: exitEvent && exitEvent.code,
                        signal: exitEvent && exitEvent.signal,
                    }));
                }
            };

            const {pid: childPid} = childProcess;
            this.runningChild.childProcess = childProcess;
            log.info({args, childPid, executablePath}, 'Started process');

            childProcess.on('exit', (code, signal) => {
                log.info({code, executablePath, signal}, 'Process exit');
                exitStatus.exitEvent = {code, signal};
                maybeHandleExit();
            });

            childProcess.on('error', err => {
                // The process could not be spawned, or The process could not be killed, or Sending a message to the child process
                // failed.
                log.error({childPid, err, executablePath}, 'Error spawning process');
                lifeTimeResolve(Object.freeze({error: err}));
            });

            childProcess.stdout.pipe(split()).on('data', line => {
                const filteredLine = this.outputFilter(line, 'STDOUT');
                if (!filteredLine) {
                    return;
                }

                log.debug({childPid, fd: 1, CHILD: true}, filteredLine);
                this.emit('STDOUT', filteredLine);
            });

            childProcess.stdout.on('end', () => {
                log.info({executablePath}, 'Process STDOUT stream has ended');
                exitStatus.stdoutEnded = true;
                maybeHandleExit();
            });
            childProcess.stderr.on('end', () => {
                log.info({executablePath}, 'Process STDERR stream has ended');
                exitStatus.stderrEnded = true;
                maybeHandleExit();
            });

            childProcess.stderr.pipe(split()).on('data', line => {
                const filteredLine = this.outputFilter(line, 'STDERR');
                if (!filteredLine) {
                    return;
                }

                log.warn({childPid, fd: 2, CHILD: true}, filteredLine);
                this.emit('STDERR', filteredLine);
            });

            if (this.enableExtraFd) {
                // this may be used for Xvfb's `-displayfd 3` option, which sends a LF after the display number, so split() works
                // properly here
                childProcess.stdio[3].pipe(split()).on('data', line => {
                    if (!line) {
                        return;
                    }

                    this.emit('FD3', line);
                });
            }

            await this._waitableEmit('afterStart');
        }
        catch (err) {
            lifeTimeResolve(Object.freeze({error: err}));
            throw err;
        }
    }

    async stop() {
        if (!this.runningChild ||
            this.runningChild.stopping ||
            !this.runningChild.childProcess) {
            // already stopping or there was an error creating the childProcess
            await this.waitForChildStop();
            return;
        }

        const {childProcess} = this.runningChild;
        const {pid: childPid} = childProcess;

        if (this.killTree && isWindows) {
            log.info({childPid}, 'Stopping process');

            await new Promise((resolve, reject) => {
                execFile('C:\\Windows\\System32\\taskkill.exe', ['/T', '/F', '/PID', childPid], (err, stdout, stderr) => {
                    if (err) {
                        log.error({err, childPid, stderr, stdout}, 'Stopping process failed: taskkill.exe non zero exit status');
                        reject(err);
                        return;
                    }

                    log.debug({childPid, stderr, stdout}, 'Stopped process using taskkill.exe');
                    resolve();
                });
            });

            await this.waitForChildStop();
        }
        else {
            // SIGTERM = clean termination
            log.info({childPid, signal: 'SIGTERM'}, 'Stopping process');
            this.runningChild.stopping = true;
            childProcess.kill('SIGTERM');

            // give it a maximum of 10 seconds to clean up
            const killTimer = setTimeout(() => {
                // SIGKILL = forceful termination
                log.info({childPid, signal: 'SIGKILL'}, 'Stopping process');
                childProcess.kill('SIGKILL');
            }, this.killTimeout);

            await this.waitForChildStop();
            clearTimeout(killTimer);
        }
    }

    async waitForChildStop() {
        await this._childLifeTime;
    }
}

module.exports = Process;
