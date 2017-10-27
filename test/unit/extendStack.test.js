'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, include}} = require('chai');

const extendStack = require('../../lib/extendStack');

describe('extendStack', () => {
    it('Should do nothing if the callback resolves', async () => {
        const result = await extendStack(async () => 123);
        eq(result, 123);
    });

    it('Should add the stack of the caller to the error rejected by the callback (v8)', async () => {
        const error = Error('foo');
        error.stack = 'FunkyError: foo\n    at myScript.js:20:16\n    at myScript.js:10:8';
        const result = await extendStack(() => Promise.reject(error)).catch(err => err);
        eq(result, error);
        include(result.stack, 'FunkyError');
        include(result.stack, 'myScript.js:20:16');
        include(result.stack, 'myScript.js:10:8');
        include(result.stack, 'extendStack.test');
    });

    it('Should add the stack of the caller to the error rejected by the callback (firefox)', async () => {
        const error = Error('foo');
        error.stack = 'bar@myScript.js line 507 > eval:15:11\n@myScript.js line 507 > eval:19:5';
        const result = await extendStack(() => Promise.reject(error)).catch(err => err);
        eq(result, error);
        include(result.stack, 'bar@myScript.js line 507');
        include(result.stack, '@myScript.js line 507');
        include(result.stack, 'extendStack.test');
    });
});
