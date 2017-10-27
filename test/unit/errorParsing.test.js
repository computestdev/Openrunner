'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, strictEqual: eq}} = require('chai');
const clone = require('clone');

const deepFreeze = require('../../lib/deepFreeze');
const errorParsing = require('../../lib/errorParsing');

const rawStack = // (firefox style)
    'extendStack@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:6:21\n' +
    'wait@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:93:20\n' +
    'foo@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/script-env.js line 507 > eval:17:11\n' +
    'bar@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js line 8004 > eval:2:15\n' +
    'run@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js:8027:35';

const magicStack = // (firefox style)
    'extendStack@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:6:21\n' +
    'wait@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:93:20\n' +
    'foo@$PERFORM-RUNNER-SCRIPT-FILE$:17:11\n' +
    'bar@$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$:2:15\n' +
    'run@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js:8027:35';

const magicStackWithoutUserCode = // (firefox style)
    'extendStack@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:6:21\n' +
    'wait@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:93:20\n' +
    'run@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js:8027:35';

const expectedFrames = deepFreeze([
    {
        columnNumber: 21,
        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
        functionName: 'extendStack',
        lineNumber: 6,
        runnerScriptContext: null,
    },
    {
        columnNumber: 20,
        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
        functionName: 'wait',
        lineNumber: 93,
        runnerScriptContext: null,
    },
    {
        columnNumber: 11,
        fileName: '$PERFORM-RUNNER-SCRIPT-FILE$',
        functionName: 'foo',
        lineNumber: 17,
        runnerScriptContext: 'main',
    },
    {
        columnNumber: 15,
        fileName: '$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$',
        functionName: 'bar',
        lineNumber: 2,
        runnerScriptContext: 'content',
    },
    {
        columnNumber: 35,
        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js',
        functionName: 'run',
        lineNumber: 8027,
        runnerScriptContext: null,
    },
]);

const expectedScriptErrorObject = deepFreeze({
    message: 'from test!',
    name: 'FunkyError',
    fileName: '$PERFORM-RUNNER-SCRIPT-FILE$',
    lineNumber: 17,
    columnNumber: 11,
    cause: undefined,
    code: undefined,
    stack: magicStack,
    stackFrames: [
        {
            columnNumber: 21,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
            functionName: 'extendStack',
            lineNumber: 6,
            runnerScriptContext: null,
        },
        {
            columnNumber: 20,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
            functionName: 'wait',
            lineNumber: 93,
            runnerScriptContext: null,
        },
        {
            columnNumber: 11,
            fileName: '$PERFORM-RUNNER-SCRIPT-FILE$',
            functionName: 'foo',
            lineNumber: 17,
            runnerScriptContext: 'main',
        },
        {
            columnNumber: 15,
            fileName: '$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$',
            functionName: 'bar',
            lineNumber: 2,
            runnerScriptContext: 'content',
        },
        {
            columnNumber: 35,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js',
            functionName: 'run',
            lineNumber: 8027,
            runnerScriptContext: null,
        },
    ],
    shortStack: 'foo@$PERFORM-RUNNER-SCRIPT-FILE$:17:11\nbar@$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$:2:15\n',
    functionName: 'foo',
});

const expectedScriptErrorObjectWithoutUserCode = deepFreeze({
    message: 'from test!',
    name: 'FunkyError',
    fileName: undefined,
    lineNumber: undefined,
    columnNumber: undefined,
    cause: undefined,
    code: undefined,
    stack: magicStackWithoutUserCode,
    stackFrames: [
        {
            columnNumber: 21,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
            functionName: 'extendStack',
            lineNumber: 6,
            runnerScriptContext: null,
        },
        {
            columnNumber: 20,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
            functionName: 'wait',
            lineNumber: 93,
            runnerScriptContext: null,
        },
        {
            columnNumber: 35,
            fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js',
            functionName: 'run',
            lineNumber: 8027,
            runnerScriptContext: null,
        },
    ],
    shortStack: null,
    functionName: 'extendStack',
});

describe('errorParsing', () => {
    describe('stackToFrames', () => {
        it('Should return null for falsy values', () => {
            eq(errorParsing.stackToFrames(null), null);
        });

        it('Should parse the error stack into an array of frames', () => {
            const error = Error('from test');
            error.stack = magicStack;
            const frames = errorParsing.stackToFrames(error);
            deq(frames, expectedFrames);
        });
    });

    describe('resolveScriptEnvEvalStack & resolveScriptContentEvalStack', () => {
        it('Should mark parts of the stack that originated from user created scripts', () => {
            const stack1 = errorParsing.resolveScriptContentEvalStack(rawStack);
            const stack2 = errorParsing.resolveScriptEnvEvalStack(stack1);
            eq(stack2, magicStack);
        });
    });

    describe('scriptErrorToObject', () => {
        it('Should return null for falsy values', () => {
            eq(errorParsing.scriptErrorToObject(null), null);
        });

        it('Should convert an error to an object containing normal error fields, stack frames and textual stacks', () => {
            const error = Error('from test!');
            error.name = 'FunkyError';
            error.stack = magicStack;

            const result = errorParsing.scriptErrorToObject(error);
            deq(result, expectedScriptErrorObject);
        });

        it('Should handle errors which did not originate in user created code', () => {
            const error = Error('from test!');
            error.name = 'FunkyError';
            error.stack = magicStackWithoutUserCode;
            const result = errorParsing.scriptErrorToObject(error);
            deq(result, expectedScriptErrorObjectWithoutUserCode);
        });

        it('Should handle errors without stacks', () => {
            const error = Error('from test!');
            error.stack = undefined;
            const result = errorParsing.scriptErrorToObject(error);
            deq(result, {
                message: 'from test!',
                name: 'Error',
                stack: 'undefined',
                stackFrames: [],
                shortStack: null,
                cause: undefined,
                code: undefined,
                columnNumber: undefined,
                fileName: undefined,
                functionName: undefined,
                lineNumber: undefined,
            });
        });
    });

    describe('replaceMagicScriptNames', () => {
        it('Should replace all instances of the magic dollar file names with the given file name', () => {
            const object = clone(expectedScriptErrorObject);
            errorParsing.replaceMagicScriptNames(object, 'fooBar.js');
            deq(object, {
                message: 'from test!',
                name: 'FunkyError',
                fileName: 'fooBar.js',
                lineNumber: 17,
                columnNumber: 11,
                cause: undefined,
                code: undefined,
                stack:
                    'extendStack@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:6:21\n' +
                    'wait@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js:93:20\n' +
                    'foo@fooBar.js:17:11\n' +
                    'bar@fooBar.js#content:2:15\n' +
                    'run@moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js:8027:35',
                stackFrames: [
                    {
                        columnNumber: 21,
                        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
                        functionName: 'extendStack',
                        lineNumber: 6,
                        runnerScriptContext: null,
                    },
                    {
                        columnNumber: 20,
                        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-script-env.js',
                        functionName: 'wait',
                        lineNumber: 93,
                        runnerScriptContext: null,
                    },
                    {
                        columnNumber: 11,
                        fileName: 'fooBar.js',
                        functionName: 'foo',
                        lineNumber: 17,
                        runnerScriptContext: 'main',
                    },
                    {
                        columnNumber: 15,
                        fileName: 'fooBar.js#content',
                        functionName: 'bar',
                        lineNumber: 2,
                        runnerScriptContext: 'content',
                    },
                    {
                        columnNumber: 35,
                        fileName: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/build/tabs-content.js',
                        functionName: 'run',
                        lineNumber: 8027,
                        runnerScriptContext: null,
                    },
                ],
                shortStack: 'foo@fooBar.js:17:11\nbar@fooBar.js#content:2:15\n',
                functionName: 'foo',
            });
        });
    });
});
