'use strict';

const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, throws}} = require('chai');

const ModuleRegister = require('../../lib/ModuleRegister');

describe('ModuleRegister', () => {
    describe('#registerModule', () => {
        it('Should allow registration of asynchronous modules by name', async () => {
            const register = new ModuleRegister();
            const promise = Promise.resolve(123);
            eq(register.registerModule('foo', promise), undefined);
            eq(register.registerModule('a', promise), undefined);
            eq(register.registerModule('fooBar', promise), undefined);
            eq(register.registerModule('foo_bar', promise), undefined);
            eq(register.registerModule('f123', promise), undefined);
        });

        it('Should throw for invalid arguments', () => {
            const register = new ModuleRegister();
            const promise = Promise.resolve(123);
            register.registerModule('foo', promise);
            throws(() => register.registerModule(123, promise), /invalid.*moduleName/i);
            throws(() => register.registerModule({}, promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('foo-bar', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('foo-bar', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('1foo', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('foo!', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('do', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('while', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('if', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('for', promise), /invalid.*moduleName/i);
            throws(() => register.registerModule('yield', promise), /invalid.*moduleName/i);
        });

        it('Should throw for duplicate registrations', () => {
            const register = new ModuleRegister();
            const promise = Promise.resolve(123);
            register.registerModule('foo', promise);
            throws(() => register.registerModule('foo', promise), /foo.*already.*register/i);
        });
    });

    describe('#hasModule', () => {
        it('Should return true for any module that is loaded or is in the progress of loading', () => {
            const register = new ModuleRegister();
            const pendingPromise = new Promise(() => {});
            const resolvedPromise = Promise.resolve(123);
            const rejectedPromise = Promise.reject(Error('from test'));
            rejectedPromise.catch(() => {}); // shut up the UnhandledPromiseRejectionWarning

            register.registerModule('pending', pendingPromise);
            register.registerModule('resolved', resolvedPromise);
            register.registerModule('rejected', rejectedPromise);

            eq(register.hasModule('pending'), true);
            eq(register.hasModule('resolved'), true);
            eq(register.hasModule('rejected'), true);
            eq(register.hasModule('somethingElse'), false);
        });
    });

    describe('#waitForModuleRegistration', () => {
        it('Should return a promise that waits for a module registration', async () => {
            const register = new ModuleRegister();
            const moduleValue = {foo: 123};

            const waitPromise1 = register.waitForModuleRegistration('foo');
            register.registerModule('foo', moduleValue);
            const waitPromise2 = register.waitForModuleRegistration('foo');

            eq(await waitPromise1, moduleValue);
            eq(await waitPromise2, moduleValue);
        });
    });

    describe('#getAllModules', () => {
        it('Should return a map with resolved module values', async () => {
            const register = new ModuleRegister();
            const moduleValueA = {foo: 123};
            const moduleValueB = {bar: 123};

            const promiseA = Promise.resolve(moduleValueA);
            let resolveB;
            const promiseB = new Promise(r => {resolveB = r;});
            register.registerModule('foo', promiseA);
            register.registerModule('bar', promiseB);

            const allModulesPromise = register.getAllModules();
            resolveB(moduleValueB);

            const allModules = await allModulesPromise;
            eq(allModules.get('foo'), moduleValueA);
            eq(allModules.get('bar'), moduleValueB);
        });
    });
});
