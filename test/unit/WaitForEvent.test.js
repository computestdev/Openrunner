'use strict';
const Promise = require('bluebird');
const {describe, it} = require('mocha-sugar-free');
require('chai').use(require('chai-as-promised'));
const {assert: {isRejected, strictEqual: eq}} = require('chai');

const WaitForEvent = require('../../lib/WaitForEvent');

describe('WaitForEvent', () => {
    it('Should resolve the correct event', async () => {
        const wait = new WaitForEvent();
        const promise = wait.wait('foo');
        const promise2 = wait.wait('foo');
        let resolved = false;
        promise.then(() => { resolved = true; });
        promise2.then(() => { resolved = true; });
        await Promise.delay(10);
        eq(resolved, false);

        wait.resolve('bar');
        await Promise.delay(10);
        eq(resolved, false);

        wait.resolve('foo', 123);
        eq(await promise, 123);
        eq(await promise2, 123);
    });

    it('Should reject the correct event', async () => {
        const wait = new WaitForEvent();
        const promise = wait.wait('foo');
        let rejected = false;
        promise.catch(() => { rejected = true; });
        await Promise.delay(10);
        eq(rejected, false);

        wait.reject('bar', Error('Error from test! bar'));
        await Promise.delay(10);
        eq(rejected, false);

        wait.reject('foo', Error('Error from test! foo'));
        await isRejected(promise, Error, 'Error from test! foo');
    });

    it('Should resolve the event multiple times', async () => {
        const wait = new WaitForEvent();
        {
            const promise = wait.wait('foo');
            wait.resolve('foo', 123);
            eq(await promise, 123);
        }
        {
            const promise = wait.wait('foo');
            wait.resolve('foo', 456);
            eq(await promise, 456);
        }
        {
            const promise = wait.wait('foo');
            wait.resolve('foo', 789);
            eq(await promise, 789);
        }

    });
});
