'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert, assert: {deepEqual: deq, strictEqual: eq, throws, isTrue, isFalse, approximately}} = require('chai');

const {TimePoint, replaceCounterFunc} = require('./TimePoint');
const TimePeriod = require('../../../runner-modules/runResult/lib/TimePeriod');

describe('TimePeriod', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    describe('.isTimePeriod', () => {
        it('Should return true for any objects which looks like a TimePoint instance', () => {
            isTrue(TimePeriod.isTimePeriod(new TimePeriod()));
            isTrue(TimePeriod.isTimePeriod(new TimePeriod(new TimePoint(), new TimePoint())));
            isFalse(TimePeriod.isTimePeriod());
            isFalse(TimePeriod.isTimePeriod(false));
            isFalse(TimePeriod.isTimePeriod({}));
            isFalse(TimePeriod.isTimePeriod({foo: 123}));
            isFalse(TimePeriod.isTimePeriod(new TimePeriod().toJSONObject()));
        });
    });

    describe('constructor', () => {
        it('Should set begin and end to null by default', () => {
            const period = new TimePeriod();
            eq(period.begin, null);
            eq(period.end, null);
        });

        it('Should set begin and end', () => {
            const begin = new TimePoint();
            const end = new TimePoint();
            const period = new TimePeriod(begin, end);
            eq(period.begin, begin);
            eq(period.end, end);
        });

        it('Should throw for invalid arguments', () => {
            throws(() => new TimePeriod(123), /must.*TimePoint/i);
            throws(() => new TimePeriod(null, 123), /must.*TimePoint/i);
        });
    });

    describe('#toJSONObject', () => {
        it('Should copy all values to a new JSON object', () => {
            const begin = new TimePoint(123);
            const end = new TimePoint(456);
            const period = new TimePeriod(begin, end);
            eq(period.begin, begin);
            eq(period.end, end);
            const periodObject = period.toJSONObject();
            deq(periodObject, {
                begin: {
                    time: 123,
                    backgroundCounter: undefined,
                    contentCounter: undefined,
                    scriptCounter: undefined,
                },
                duration: 333,
                end: {
                    time: 456,
                    backgroundCounter: undefined,
                    contentCounter: undefined,
                    scriptCounter: undefined,
                },
            });
        });
    });

    describe('#duration', () => {
        it('Should return the difference between begin and end', () => {
            const begin = new TimePoint(123);
            const end = new TimePoint(456);
            const period = new TimePeriod(begin, end);
            eq(period.duration, 333);
        });

        it('Should return NaN if begin or end is not set', () => {
            const period = new TimePeriod(new TimePoint(123));
            const period2 = new TimePeriod(null, null);
            assert(Number.isNaN(period.duration));
            assert(Number.isNaN(period2.duration));
        });
    });

    describe('#clear', () => {
        it('Should set begin and end to null', () => {
            const period = new TimePeriod(new TimePoint(123), new TimePoint(123));
            period.clear();
            eq(period.begin, null);
            eq(period.end, null);
        });
    });

    describe('#beginAtTime', () => {
        it('Should set begin to a new TimePoint with the given time', () => {
            const period = new TimePeriod();
            period.beginAtTime(123);
            eq(period.begin.time, 123);
            eq(period.begin.contentCounter, undefined);
        });
    });

    describe('#endAtTime', () => {
        it('Should set end to a new TimePoint with the given time', () => {
            const period = new TimePeriod();
            period.endAtTime(123);
            eq(period.end.time, 123);
            eq(period.end.contentCounter, undefined);
        });
    });

    describe('#isCleared', () => {
        it('Should return true if begin and end are null', () => {
            isTrue(new TimePeriod(null, null).isCleared);
            isFalse(new TimePeriod(new TimePoint(123), null).isCleared);
            isFalse(new TimePeriod(null, new TimePoint(123)).isCleared);
            isFalse(new TimePeriod(new TimePoint(123), new TimePoint(123)).isCleared);
        });
    });

    describe('#isPending', () => {
        it('Should return true if begin is set, but end is not', () => {
            isFalse(new TimePeriod(null, null).isPending);
            isTrue(new TimePeriod(new TimePoint(123), null).isPending);
            isFalse(new TimePeriod(null, new TimePoint(123)).isPending);
            isFalse(new TimePeriod(new TimePoint(123), new TimePoint(123)).isPending);
        });
    });

    describe('#isComplete', () => {
        it('Should return true if begin and end are set', () => {
            isFalse(new TimePeriod(null, null).isComplete);
            isFalse(new TimePeriod(new TimePoint(123), null).isComplete);
            isFalse(new TimePeriod(null, new TimePoint(123)).isComplete);
            isTrue(new TimePeriod(new TimePoint(123), new TimePoint(123)).isComplete);
        });
    });

    describe('#beginNow', () => {
        it('Should set begin to the current time', () => {
            const period = new TimePeriod();
            const nowTime = Date.now();
            period.beginNow();
            eq(period.begin.backgroundCounter, undefined);
            eq(period.begin.scriptCounter, undefined);
            approximately(period.begin.contentCounter, nowTime + 123456789, 100);
            approximately(period.begin.time, nowTime, 100);
            eq(period.end, null);
        });

        it('Should throw unless the period isCleared', () => {
            const period = new TimePeriod();
            period.beginNow();
            throws(() => period.beginNow(), /invalid.*state.*begin.*cleared/i);
        });
    });

    describe('#endNow', () => {
        it('Should set end to the current time', () => {
            const period = new TimePeriod(new TimePoint(123));
            const nowTime = Date.now();
            period.endNow();
            eq(period.begin.time, 123);
            eq(period.end.backgroundCounter, undefined);
            eq(period.end.scriptCounter, undefined);
            approximately(period.end.contentCounter, nowTime + 123456789, 100);
            approximately(period.end.time, nowTime, 100);
        });

        it('Should throw unless the period isPending', () => {
            const period = new TimePeriod();
            throws(() => period.endNow(), /invalid.*state.*end.*pending/i);
        });

        it('Should throw unless the period isPending', () => {
            const period = new TimePeriod(new TimePoint(123));
            period.endNow();
            throws(() => period.endNow(), /invalid.*state.*end.*pending/i);
        });
    });
});
