'use strict';
/* eslint-env node */
const Promise = require('bluebird');
const path = require('path');
require('chai').use(require('chai-as-promised'));
const {assert: {isNaN, lengthOf, strictEqual: eq, match, deepEqual: deq, isRejected, approximately, isAbove, instanceOf}} = require('chai');
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');

const Process = require('../../../lib/node/Process');
const Wait = require('../../utilities/Wait');

const IS_WINDOWS = process.platform === 'win32';

const {env: testRunnerEnv} = process;
const PROCESS_STUB_PATH = IS_WINDOWS
    ? require.resolve('../../utilities/process.js.cmd')
    : require.resolve('../../utilities/process.js');

describe('node/Process', {timeout: 10000, slow: 5000}, () => {
    let process;
    let output;
    let waitForOutput;

    beforeEach(() => {
        output = [];
        waitForOutput = new Wait();
    });

    afterEach(async () => {
        if (process) {
            await process.stop();
            process = null;
        }
    });

    const attachOutputListeners = () => {
        process.on('STDOUT', line => {
            output.push({line, type: 'STDOUT'});
            waitForOutput.advance();
        });

        process.on('STDERR', line => {
            output.push({line, type: 'STDERR'});
            waitForOutput.advance();
        });

        process.on('FD3', line => {
            output.push({line, type: 'FD3'});
            waitForOutput.advance();
        });
    };

    describe('#start()', () => {
        it('Should start the process, update statistics and raise events', async () => {
            const events = [];
            process = new Process({executablePath: PROCESS_STUB_PATH});
            eq(process.isRunning, false);
            isNaN(process.lastProcessStart);
            isNaN(process.lastProcessExit);
            eq(process.processExitCount, 0);

            process.on('beforeStart', wait => { events.push('beforeStart'); wait(Promise.delay(1)); });
            process.on('afterStart', wait => { events.push('afterStart'); wait(() => Promise.delay(1)); });
            process.on('stopped', (reason, wait) => { events.push('stopped'); wait(Promise.delay(1)); });
            process.on('afterStopped', () => { events.push('afterStopped'); });

            const expectedStartTime1 = Date.now();
            await process.start();
            deq(events, ['beforeStart', 'afterStart']);
            eq(process.isRunning, true);
            const startTime1 = process.lastProcessStart;
            approximately(startTime1, expectedStartTime1, 250);
            isNaN(process.lastProcessExit);
            eq(process.processExitCount, 0);

            await Promise.delay(500);
            const expectedExitTime1 = Date.now();
            await process.stop();
            deq(events, ['beforeStart', 'afterStart', 'stopped', 'afterStopped']);
            eq(process.isRunning, false);
            eq(process.lastProcessStart, startTime1);
            const exitTime1 = process.lastProcessExit;
            isAbove(exitTime1, startTime1);
            approximately(exitTime1, expectedExitTime1, 250);
            eq(process.processExitCount, 1);

            const expectedStartTime2 = Date.now();
            await process.start();
            deq(events, ['beforeStart', 'afterStart', 'stopped', 'afterStopped', 'beforeStart', 'afterStart']);
            eq(process.isRunning, true);
            approximately(process.lastProcessStart, expectedStartTime2, 250);
            eq(process.lastProcessExit, exitTime1);
            eq(process.processExitCount, 1);

            const expectedExitTime2 = Date.now();
            await process.stop();
            deq(events, ['beforeStart', 'afterStart', 'stopped', 'afterStopped', 'beforeStart', 'afterStart', 'stopped', 'afterStopped']);
            eq(process.isRunning, false);
            isAbove(process.lastProcessExit, startTime1);
            approximately(process.lastProcessExit, expectedExitTime2, 250);
            eq(process.processExitCount, 2);
        });

        it('Should emit stop events if the child fails to start', async () => {
            const events = [];
            process = new Process({executablePath: path.join(__dirname, `A FILE THAT DOES NOT EXIST ${Math.random()}`)});
            process.on('beforeStart', () => { events.push(['beforeStart']); });
            process.on('afterStart', () => { events.push(['afterStart']); });
            process.on('stopped', (reason) => { events.push(['stopped', reason]); });
            process.on('afterStopped', (reason) => { events.push(['afterStopped', reason]); });

            await process.start();
            await process.waitForChildStop();
            eq(process.isRunning, false);
            lengthOf(events, 4);
            deq(events[0], ['beforeStart']);
            deq(events[1], ['afterStart']);
            eq(events[2][0], 'stopped');
            eq(events[3][0], 'afterStopped');
            instanceOf(events[2][1].error, Error);
            eq(events[3][1].error, events[2][1].error);
            match(events[2][1].error.message, /spawn.*ENOENT/);
        });

        it('Should not allow starting the same process multi times', async () => {
            process = new Process({executablePath: PROCESS_STUB_PATH});

            const firstStart = process.start();
            await isRejected(process.start(), Error, /process.*already.*start/i);
            await firstStart;

            await isRejected(process.start(), Error, /process.*already.*start/i);
        });

        it('Should emit events for each line received on STDOUT and STDERR', async t => {
            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['321', 'an argument with spaces'],
                env: {
                    FOO: '123',
                    BAR: 'env with spaces',
                },
            });
            attachOutputListeners();

            await process.start();
            await waitForOutput.waitUntil(6);

            deq(output[0], {line: 'HELLO!', type: 'STDOUT'});

            const argv = JSON.parse(output[1].line);
            lengthOf(argv, 4);
            match(argv[0], /node(?:\.exe)?$/);
            match(argv[1], /process\.js$/);
            eq(argv[2], '321');
            eq(argv[3], 'an argument with spaces');

            const env = JSON.parse(output[2].line);
            eq(env.FOO, '123');
            eq(env.BAR, 'env with spaces');
            eq(env.HOME, testRunnerEnv.HOME, 'should inherit environment variables');

            deq(output.slice(3), [
                {
                    line: 'SOMETHING TO STDOUT',
                    type: 'STDOUT',
                },
                {
                    line: 'SOMETHING ELSE TO STDOUT',
                    type: 'STDOUT',
                },
                {
                    line: 'SOMETHING TO STDERR',
                    type: 'STDERR',
                },
            ]);
        });

        it('Should emit events for each line received on STDOUT, STDERR and FD3', async t => {
            if (IS_WINDOWS) {
                t.skip(); // FD3 is not supported on windows
            }

            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['FD3', 'an argument with spaces'],
                env: {
                    FOO: '123',
                    BAR: 'env with spaces',
                },
                enableExtraFd: true,
            });
            attachOutputListeners();

            await process.start();
            await waitForOutput.waitUntil(7);

            deq(output[0], {line: 'HELLO!', type: 'STDOUT'});

            const argv = JSON.parse(output[1].line);
            lengthOf(argv, 4);
            match(argv[0], /node(?:\.exe)?$/);
            match(argv[1], /process\.js$/);
            eq(argv[2], 'FD3');
            eq(argv[3], 'an argument with spaces');

            const env = JSON.parse(output[2].line);
            eq(env.FOO, '123');
            eq(env.BAR, 'env with spaces');
            eq(env.HOME, testRunnerEnv.HOME, 'should inherit environment variables');

            deq(output.slice(3), [
                {
                    line: 'SOMETHING TO STDOUT',
                    type: 'STDOUT',
                },
                {
                    line: 'SOMETHING ELSE TO STDOUT',
                    type: 'STDOUT',
                },
                {
                    line: 'SOMETHING TO STDERR',
                    type: 'STDERR',
                },
                {
                    line: 'SOMETHING TO FILE DESCRIPTOR 3',
                    type: 'FD3',
                },
            ]);
        });
    });

    describe('#stop()', () => {
        it('Should kill the process if running', async () => {
            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: [],
            });
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            attachOutputListeners();
            await process.start();
            await waitForOutput.waitUntil(1);
            await process.stop();

            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: null, signal: 'SIGTERM'});
        });

        it('Should kill the process if running using SIGTERM on linux', async t => {
            if (IS_WINDOWS) {
                t.skip();
            }

            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['LOG_EXIT_SIGNALS'],
            });
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            attachOutputListeners();
            await process.start();
            await waitForOutput.waitUntil(1);
            await process.stop();
            const sigtermLines = output.filter(({line}) => line === 'RECEIVED SIGTERM');
            lengthOf(sigtermLines, 1);
            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: 143, signal: null});
        });

        it('Should do nothing if the process is already being stopped', async t => {
            if (IS_WINDOWS) {
                t.skip();
            }

            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['LOG_EXIT_SIGNALS'],
            });
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            attachOutputListeners();
            await process.start();
            await waitForOutput.waitUntil(1);
            await Promise.all([
                process.stop(),
                process.stop(),
                process.stop(),
            ]);
            const sigtermLines = output.filter(({line}) => line === 'RECEIVED SIGTERM');
            lengthOf(sigtermLines, 1);
            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: 143, signal: null});
        });

        it('Should do nothing if the process is already being stopped, but still wait for the termination', async t => {
            if (IS_WINDOWS) {
                t.skip();
            }

            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['LOG_EXIT_SIGNALS'],
            });
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            attachOutputListeners();
            await process.start();
            await waitForOutput.waitUntil(1);
            await Promise.race([
                process.stop(),
                process.stop(),
                process.stop(),
            ]);
            const sigtermLines = output.filter(({line}) => line === 'RECEIVED SIGTERM');
            lengthOf(sigtermLines, 1);
            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: 143, signal: null});
        });

        it('Should do nothing if the process is not running', async () => {
            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: [],
            });
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            await process.stop();
            lengthOf(stopEvents, 0);
        });

        it('Should forcefully terminate the process if if does not quit cleanly within a timeout', async t => {
            if (IS_WINDOWS) {
                t.skip();
            }

            process = new Process({
                executablePath: [PROCESS_STUB_PATH, 'IGNORE_EXIT_SIGNALS'],
                args: [],
                killTimeout: 2000,
            });
            attachOutputListeners();
            const waitForSigTerm = new Wait();
            process.on('STDERR', line => line === 'IGNORED SIGTERM' && waitForSigTerm.advance());
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            await process.start();
            await waitForOutput.waitUntil(1);
            const stopPromise = process.stop();
            await waitForSigTerm.waitUntil(1);
            lengthOf(stopEvents, 0);
            await Promise.delay(100);
            lengthOf(stopEvents, 0);
            await stopPromise;
            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: null, signal: 'SIGKILL'});
        });
    });

    describe('#ensureStarted()', () => {
        it('Should start the process if not running, but also do nothing if the process is already running', async () => {
            process = new Process({executablePath: PROCESS_STUB_PATH});

            await Promise.all([
                process.ensureStarted(),
                process.ensureStarted(),
                process.ensureStarted(),
            ]);
            eq(process.isRunning, true);
            attachOutputListeners();
            await waitForOutput.waitUntil(1);
        });

        it('Should wait for the old process to exit if we are currently stopping it', async () => {
            process = new Process({executablePath: PROCESS_STUB_PATH});
            const waitForHello = new Wait();
            process.on('STDOUT', line => line === 'HELLO!' && waitForHello.advance());
            await process.start();
            await waitForHello.waitUntil(1);
            await Promise.all([
                process.stop(),
                process.ensureStarted(),
            ]);
            eq(process.processExitCount, 1);
            eq(process.isRunning, true);
            await waitForHello.waitUntil(2);
        });
    });

    describe('#waitForChildStop', () => {
        it('Should wait for the child process to quit on its own', async () => {
            process = new Process({
                executablePath: PROCESS_STUB_PATH,
                args: ['EARLY_EXIT'],
            });
            attachOutputListeners();
            const stopEvents = [];
            process.on('stopped', (reason) => stopEvents.push(reason));
            await process.start();
            await waitForOutput.waitUntil(1);
            await process.waitForChildStop();
            lengthOf(stopEvents, 1);
            deq(stopEvents[0], {error: null, code: 99, signal: null});
        });

        it('Should immediately resolve if the child has already stopped', async () => {
            process = new Process({executablePath: PROCESS_STUB_PATH});
            await process.waitForChildStop();
        });
    });
});
