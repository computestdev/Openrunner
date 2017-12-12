'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, strictEqual: eq, ok, throws, approximately}} = require('chai');

const {TimePoint, replaceCounterFunc} = require('./TimePoint');
const TimePeriod = require('../../../runner-modules/runResult/lib/TimePeriod');
const Transaction = require('../../../runner-modules/runResult/lib/Transaction');

describe('Transaction', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    describe('constructor', () => {
        it('Should set the id and initialize all properties', () => {
            const transaction = new Transaction('Foo');
            eq(transaction.id, 'Foo');
            eq(transaction.title, 'Foo');
            eq(transaction.timing.isCleared, true);
            eq(transaction.error, null);
            eq(transaction.eatError, false);
            eq(transaction.isPending, false);
            ok(Object.isFrozen(transaction));
        });
    });

    describe('#id', () => {
        it('Should not be mutable', () => {
            const transaction = new Transaction('Foo');
            throws(() => { transaction.id = 'Bar'; });
            eq(transaction.id, 'Foo');
        });
    });

    describe('Simple getters/setters for string properties', () => {
        it('Should properly store correct values', () => {
            const transaction = new Transaction('Foo');
            transaction.title = 'new title!';
            transaction.eatError = true;

            eq(transaction.title, 'new title!');
            eq(transaction.eatError, true);
        });

        it('Should stringify when setting', () => {
            const transaction = new Transaction('Foo');
            transaction.title = 123;
            eq(transaction.title, '123');
        });
        it('Should boolify when setting', () => {
            const transaction = new Transaction('Foo');
            transaction.eatError = 123;
            eq(transaction.eatError, true);
            transaction.eatError = 0;
            eq(transaction.eatError, false);
        });
    });

    describe('#timing', () => {
        it('Should allow setting a new value', () => {
            const transaction = new Transaction('Foo');
            const timing = new TimePeriod();
            transaction.timing = timing;
            eq(transaction.timing, timing);
        });

        it('Should throw if an invalid value is set', () => {
            const transaction = new Transaction('Foo');
            throws(() => { transaction.timing = 'foo'; }, /must.*TimePeriod/i);
        });
    });

    describe('#error', () => {
        it('Should set Error objects or null', () => {
            const err = Error('error from test!');
            const err2 = {name: 'Error', message: 'Kaput'};
            const transaction = new Transaction('Foo');
            transaction.error = err;
            eq(transaction.error, err);
            transaction.error = null;
            eq(transaction.error, null);
            transaction.error = err2;
            eq(transaction.error, err2);
        });

        it('Should throw if a value is set that is not an Error', () => {
            const transaction = new Transaction('Foo');
            throws(() => { transaction.error = 'foo'; }, /must.*Error/i);
            throws(() => { transaction.error = {}; }, /must.*Error/i);
        });
    });

    describe('#toJSONObject', () => {
        it('Should copy some values to a new JSON object', () => {
            const transaction = new Transaction('Foo');
            transaction.title = 'bar!!';
            transaction.timing = new TimePeriod(new TimePoint(120, {contentCounter: 120}), new TimePoint(500, {contentCounter: 500}));
            transaction.error = {name: 'Error', message: 'Kaput', stack: 'stack trace!!!'};
            transaction.eatError = true;

            const transObject = transaction.toJSONObject();
            deq(transObject, {
                id: 'Foo',
                title: 'bar!!',
                error: {
                    name: 'Error',
                    message: 'Kaput',
                    stack: 'stack trace!!!',
                    cause: undefined,
                    code: undefined,
                    columnNumber: undefined,
                    fileName: undefined,
                    lineNumber: undefined,
                },
                timing: {
                    begin: {
                        time: 120,
                        contentCounter: 120,
                        backgroundCounter: undefined,
                        scriptCounter: undefined,
                    },
                    duration: 380,
                    end: {
                        time: 500,
                        contentCounter: 500,
                        backgroundCounter: undefined,
                        scriptCounter: undefined,
                    },
                },
            });
        });
    });

    describe('#beginNow', () => {
        it('Should set begin to the current time', () => {
            const transaction = new Transaction('Foo');
            const nowTime = Date.now();
            transaction.beginNow();
            eq(transaction.isPending, true);
            eq(transaction.timing.begin.backgroundCounter, undefined);
            eq(transaction.timing.begin.scriptCounter, undefined);
            approximately(transaction.timing.begin.contentCounter, nowTime + 123456789, 100);
            approximately(transaction.timing.begin.time, nowTime, 100);
            eq(transaction.timing.end, null);
        });

        it('Should throw unless the period isCleared', () => {
            const transaction = new Transaction('Foo');
            transaction.beginNow();
            throws(() => transaction.beginNow(), /invalid.*state.*begin.*cleared/i);
        });
    });

    describe('#endNow', () => {
        it('Should set end to the current time', () => {
            const transaction = new Transaction('Foo');
            transaction.timing.begin = new TimePoint(123);
            const nowTime = Date.now();
            transaction.endNow();
            eq(transaction.isPending, false);
            eq(transaction.timing.begin.time, 123);
            eq(transaction.timing.end.backgroundCounter, undefined);
            eq(transaction.timing.end.scriptCounter, undefined);
            approximately(transaction.timing.end.contentCounter, nowTime + 123456789, 100);
            approximately(transaction.timing.end.time, nowTime, 100);
        });

        it('Should throw unless the period isPending', () => {
            const transaction = new Transaction('Foo');
            throws(() => transaction.endNow(), /invalid.*state.*end.*pending/i);
        });

        it('Should throw unless the period isPending', () => {
            const transaction = new Transaction('Foo');
            transaction.timing.begin = new TimePoint(123);
            transaction.endNow();
            throws(() => transaction.endNow(), /invalid.*state.*end.*pending/i);
        });
    });
});
