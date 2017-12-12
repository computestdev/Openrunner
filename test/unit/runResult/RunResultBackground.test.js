'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert: {lengthOf, strictEqual: eq, deepEqual: deq, instanceOf, isString, isAbove}} = require('chai');

const {replaceCounterFunc} = require('./TimePoint');
const RunResult = require('../../../runner-modules/runResult/lib/RunResult');
const RunResultBackground = require('../../../runner-modules/runResult/lib/background/RunResultBackground');

describe('RunResultBackground', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    it('Should inherit from RunResult', () => {
        instanceOf(new RunResultBackground(), RunResult);
    });

    describe('#toJSONObject', () => {
        const createRunResult = () => {
            const runResult = new RunResultBackground();
            runResult.timeEvent('event2', 100, 1000);
            runResult.timeEvent('event1', 90, 1000);
            runResult.timeEvent('event3', 110, 1000);
            runResult.timeEvent('event4', 120, 1000);
            runResult.timeEvent('event5', 130, 1000);
            runResult.timeEvent('event6', 140, 1000);
            return runResult;
        };

        it('Should add a unique id to all events', () => {
            const runResult = createRunResult();

            const runResultObject = runResult.toJSONObject();
            lengthOf(runResultObject.events, 6);
            eq(runResultObject.events[0].type, 'event1');
            eq(runResultObject.events[1].type, 'event2');
            eq(runResultObject.events[2].type, 'event3');
            eq(runResultObject.events[3].type, 'event4');
            eq(runResultObject.events[4].type, 'event5');
            eq(runResultObject.events[5].type, 'event6');

            const idSet = new Set();
            for (const event of runResultObject.events) {
                isString(event.id);
                isAbove(event.id.length, 0);
                idSet.add(event.id);
            }
            eq(idSet.size, 6, 'one or more duplicate ID\'s');
        });

        it('Should generate id\'s that are unique between different RunResults', () => {
            const idSet = new Set();
            for (let i = 0; i < 100; ++i) {
                const runResult = createRunResult();
                for (const event of runResult.toJSONObject().events) {
                    idSet.add(event.id);
                }
            }
            eq(idSet.size, 100 * 6, 'one or more duplicate ID\'s');
        });

        describe('error translating', () => {
            const createError = () => {
                const error = Error('error from test!');
                error.stack =
                    'extendStack@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js:6:21\n' +
                    'wait@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js:93:20\n' +
                    '@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/script-env.js line 221 > eval:63:11\n' +
                    '@$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$:2:15\n' +
                    'run@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-content.js:8085:35\n';
                error.fileName = 'moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js';
                error.lineNumber = 45;
                error.columnNumber = 21;
                return error;
            };
            const createExpectedError = (translated) => {
                const translatedFile1 = translated
                    ? 'mySpecialScript.js'
                    : '$PERFORM-RUNNER-SCRIPT-FILE$';
                const translatedFile2 = translated
                    ? 'mySpecialScript.js#content'
                    : '$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$';

                return {
                    message: 'error from test!',
                    name: 'Error',
                    cause: undefined,
                    code: undefined,
                    stack:
                        'extendStack@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js:6:21\n' +
                        'wait@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js:93:20\n' +
                        `@${translatedFile1}:63:11\n` +
                        `@${translatedFile2}:2:15\n` +
                        'run@moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-content.js:8085:35\n',
                    fileName: translatedFile1,
                    lineNumber: 63,
                    columnNumber: 11,
                    stackFrames: [
                        {
                            columnNumber: 21,
                            fileName: 'moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js',
                            functionName: 'extendStack',
                            lineNumber: 6,
                            runnerScriptContext: null,
                        },
                        {
                            columnNumber: 20,
                            fileName: 'moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-script-env.js',
                            functionName: 'wait',
                            lineNumber: 93,
                            runnerScriptContext: null,
                        },
                        {
                            columnNumber: 11,
                            fileName: translatedFile1,
                            functionName: null,
                            lineNumber: 63,
                            runnerScriptContext: 'main',
                        },
                        {
                            columnNumber: 15,
                            fileName: translatedFile2,
                            functionName: null,
                            lineNumber: 2,
                            runnerScriptContext: 'content',
                        },
                        {
                            columnNumber: 35,
                            fileName: 'moz-extension://9acbe1f0-6b33-9e4d-babc-75c53d8f5bb3/build/tabs-content.js',
                            functionName: 'run',
                            lineNumber: 8085,
                            runnerScriptContext: null,
                        },
                    ],
                    shortStack:
                        `@${translatedFile1}:63:11\n` +
                        `@${translatedFile2}:2:15\n`,
                    functionName: null,
                };
            };

            it('Should support transactions that have no error', async () => {
                const runResult = new RunResultBackground();
                await runResult.transaction('foo', t => {});

                const runResultObject = runResult.toJSONObject({scriptFileName: 'mySpecialScript.js'});
                eq(runResultObject.transactions[0].error, null);
            });

            it('Should not translate file names if the scriptFileName option is unset', async () => {
                const runResult = new RunResultBackground();
                await runResult.transaction('foo', t => {
                    t.eatError = true;
                    throw  createError();
                });

                const runResultObject = runResult.toJSONObject();
                const expectedError = createExpectedError(false);
                deq(runResultObject.transactions[0].error, expectedError);
            });

            it('Should translate file names in the error stack of transactions', async () => {
                const runResult = new RunResultBackground();
                await runResult.transaction('foo', t => {
                    t.eatError = true;
                    const error = createError();
                    error.cause = createError();
                    error.cause.message = 'error cause from test!';
                    throw error;
                });

                const runResultObject = runResult.toJSONObject({scriptFileName: 'mySpecialScript.js'});
                const expectedError = createExpectedError(true);
                expectedError.cause = createExpectedError(true);
                expectedError.cause.message = 'error cause from test!';
                deq(runResultObject.transactions[0].error, expectedError);
            });

        });
    });
});
