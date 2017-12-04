'use strict';
/* eslint-env node */
const Promise = require('bluebird');
const EventEmitter = require('events');
const {spawn} = require('child_process');
const split = require('split');
const {assert} = require('chai');

const log = require('../../lib/logger')({hostname: 'test', MODULE: 'Process'});

class Process extends EventEmitter {
    constructor({executablePath, args, env, cwd, enableExtraFd, outputFilter = s => s}) {
        super();
        this.executablePath = executablePath;
        this.args = args || [];
        this.env = env || {};
        this.cwd = cwd || undefined; // undefined = inherit
        this.enableExtraFd = Boolean(enableExtraFd || false);
        this.outputFilter = outputFilter;

        this.runningChild = null;
        this.childrenLifeTime = Promise.resolve();
        this.lastProcessStart = NaN;
        this.lastProcessExit = NaN;
        this.processExitCount = 0;

        this._lastStartSymbol = null;
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

        const lastStartSymbol = Symbol();
        this._lastStartSymbol = lastStartSymbol;

        let lifeTimeResolve;
        let lifeTimeReject;

        const childLifeTime = new Promise((resolve, reject) => {
            lifeTimeResolve = resolve;
            lifeTimeReject = reject;
        })
        .finally(() => {
            if (this._lastStartSymbol === lastStartSymbol) {
                this.runningChild = null;
            }
        });

        this.childrenLifeTime = this.childrenLifeTime
        .finally(async () => {
            await childLifeTime;

            if (this._lastStartSymbol === lastStartSymbol) {
                await this._waitableEmit('stopped');
                log.info('Process stopped');
                this.emit('afterStopped');
            }

            return null;
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
                }
            );

            const {pid: childPid} = childProcess;
            this.runningChild.childProcess = childProcess;
            log.info({args, childPid, executablePath}, 'Started process');

            childProcess.on('exit', (code, signal) => {
                log.info({code, executablePath, signal}, 'Process exit');
                this.lastProcessExit = Date.now();
                ++this.processExitCount;
                lifeTimeResolve({code, signal});
            });

            childProcess.on('error', err => {
                // The process could not be spawned, or The process could not be killed, or Sending a message to the child process
                // failed.
                log.error({childPid, err, executablePath}, 'Error spawning process');
                lifeTimeReject(err);
            });

            childProcess.stdout.pipe(split()).on('data', line => {
                const filteredLine = this.outputFilter(line, 'STDOUT');
                if (!filteredLine) {
                    return;
                }

                log.debug({childPid, fd: 1, CHILD: true}, filteredLine);
                this.emit('STDOUT', filteredLine);
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
        }
        catch (err) {
            lifeTimeReject(err);
            throw err;
        }

        // try to throw if the child immediately fails to start:
        await Promise.race([Promise.delay(10), childLifeTime]);
        await this._waitableEmit('afterStart');
    }

    async stop() {
        if (!this.runningChild ||
            this.runningChild.stopping ||
            !this.runningChild.childProcess) {
            // already stopping or there was an error creating the childProcess
            await this.childrenLifeTime.catch(() => {});

            return;
        }

        const {childProcess} = this.runningChild;

        // SIGTERM = clean termination
        log.info({signal: 'SIGTERM'}, 'Stopping process');
        this.runningChild.stopping = true;
        childProcess.kill('SIGTERM');

        // give it a maximum of 10 seconds to clean up
        const killTimer = setTimeout(() => {
            // SIGKILL = forceful termination
            log.info({signal: 'SIGKILL'}, 'Stopping process');
            childProcess.kill('SIGKILL');
        }, 10000);

        await this.childrenLifeTime.catch(() => {});
        clearTimeout(killTimer);
    }
}

module.exports = Process;
