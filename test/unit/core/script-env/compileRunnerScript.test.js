'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, strictEqual: eq, isFunction, instanceOf}} = require('chai');
const sinon = require('sinon');

const compileRunnerScript = require('../../../../core/lib/script-env/compileRunnerScript');

describe('compileRunnerScript', () => {
    it('Should construct an executable function from a runner script', async () => {
        const script = '"Openrunner-Script:  v1";\n' +
            'const stuff = await include("stuff");\n' +
            'const value = await transaction("foo", () => 123);\n' +
            'stuff(value)\n';
        const func = compileRunnerScript(script);
        isFunction(func);

        const stuff = sinon.spy();
        const include = sinon.spy(async () => stuff);
        const transaction = sinon.spy(async (title, func) => func());

        const promise = func(include, transaction);
        isFunction(promise.then);
        await promise;
        eq(include.callCount, 1);
        eq(transaction.callCount, 1);
        eq(stuff.callCount, 1);
        deq(stuff.firstCall.args, [123]);
    });

    it('Should pass on any rejections', async () => {
        const script = '"Openrunner-Script:  v1";\n' +
            'throw Error("from test!")';
        const func = compileRunnerScript(script);
        isFunction(func);

        const promise = func(async () => {}, async () => {});
        isFunction(promise.then);
        const error = await promise.catch(err => err);
        instanceOf(error, Error);
        eq(error.message, 'from test!');
    });
});
