'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, throws}} = require('chai');
const sinon = require('sinon');

const MethodRegistrations = require('../../../lib/contentRpc/MethodRegistrations');

describe('MethodRegistrations', () => {
    it('Should throw for invalid arguments', async () => {
        const methods = new MethodRegistrations();
        throws(() => methods.register(123, () => {}), Error, /register\b.*argument.*name.*string/i);
        throws(() => methods.register('foo', 'bar'), Error, /register\b.*argument.*func.*function/i);
        throws(() => methods.registerAll('foo'), Error, /registerAll.*argument.*map/i);
        throws(() => methods.get(123), Error, /get.*argument.*name.*string/i);
        throws(() => methods.call(123), Error, /argument.*name.*string/i);
    });

    it('Should throw if a method is called that has not been registered', () => {
        const methods = new MethodRegistrations();
        throws(() => methods.call('foo', 'bar'), Error, /call.*method.*foo.*not.*found/i);
    });
    it('Should throw if a method is called that is not a function', () => {
        const methods = new MethodRegistrations();
        methods.registerAll(new Map([
            ['foo', 123],
        ]));
        throws(() => methods.call('foo', 'bar'), Error, /call.*method.*foo.*not.*found/i);
    });

    it('Should call the last registered method', () => {
        const methods = new MethodRegistrations();
        const methodA = sinon.spy((a, b) => a + b + 123);
        const methodB = sinon.spy((a, b) => a + b + 456);
        const methodC = sinon.spy((a, b) => a + b + 789);
        const methodD = sinon.spy((a) => a * 4);

        methods.register('foo', methodA);
        eq(methods.call('foo', 1, 2), 126);
        eq(methodA.callCount, 1);
        eq(methodB.callCount, 0);

        methods.register('foo', methodB);
        eq(methods.call('foo', 1, 2), 459);
        eq(methodA.callCount, 1);
        eq(methodB.callCount, 1);

        methods.registerAll(new Map([
            ['foo', methodC],
            ['bar', methodD],
        ]));
        eq(methods.call('foo', 1, 2), 792);
        eq(methodA.callCount, 1);
        eq(methodB.callCount, 1);
        eq(methodC.callCount, 1);

        eq(methods.call('bar', 3), 12);
        eq(methodA.callCount, 1);
        eq(methodB.callCount, 1);
        eq(methodC.callCount, 1);
        eq(methodD.callCount, 1);
    });
});
