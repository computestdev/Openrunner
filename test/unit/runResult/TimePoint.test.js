'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const {assert, assert: {
    approximately, deepEqual: deq, strictEqual: eq, isObject, throws, isTrue, ok, isNotOk, fail, isFalse, isBelow, isAbove,
}} = require('chai');

const {TimePoint, replaceCounterFunc} = require('./TimePoint');

describe('TimePoint', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    afterEach(() => {
        replaceCounterFunc(() => fail());
    });

    describe('.setCounterFunc', () => {
        it('Should throw if already set', () => {
            // (Already set by ./TimePoint.js)
            throws(() => TimePoint.setCounterFunc(() => 'foo'), /already.*set/i);
        });
    });

    describe('constructor', () => {
        it('Should initialize using the current time if no arguments are passed', () => {
            const nowTime = Date.now();
            const nowPoint = new TimePoint();

            eq(nowPoint.backgroundCounter, undefined);
            eq(nowPoint.scriptCounter, undefined);
            approximately(nowPoint.contentCounter, nowTime + 123456789, 100);
            approximately(nowPoint.time, nowTime, 100);
            ok(Object.isFrozen(nowPoint));
        });

        it('Should initialize using the current time if no arguments are passed', () => {
            replaceCounterFunc(() => ({
                backgroundCounter: Date.now() - 59129764,
                scriptCounter: Date.now() + 34863445746523,
                contentCounter: Date.now() + 123456789,
            }));

            const nowTime = Date.now();
            const nowPoint = new TimePoint();

            approximately(nowPoint.backgroundCounter, nowTime - 59129764, 100);
            approximately(nowPoint.scriptCounter, nowTime + 34863445746523, 100);
            approximately(nowPoint.contentCounter, nowTime + 123456789, 100);
            approximately(nowPoint.time, nowTime, 100);
            ok(Object.isFrozen(nowPoint));
        });

        it('Should initialize using time values passed to the constructor', () => {
            const point = new TimePoint(2010203, {contentCounter: 54321});
            eq(point.time, 2010203);
            eq(point.contentCounter, 54321);
            eq(point.scriptCounter, undefined);
            eq(point.backgroundCounter, undefined);
            ok(Object.isFrozen(point));
        });

        it('Should initialize using time values passed to the constructor', () => {
            const point = new TimePoint(2010203);
            eq(point.time, 2010203);
            eq(point.contentCounter, undefined);
            eq(point.scriptCounter, undefined);
            eq(point.backgroundCounter, undefined);
            ok(Object.isFrozen(point));
        });

        it('Should throw for invalid arguments', () => {
            throws(() => new TimePoint('foo', {}), /invalid.*time.*number/i);
            throws(() => new TimePoint(123, 123), /invalid.*counters.*object/i);
            throws(() => new TimePoint(123, {contentCounter: 'foo'}), /invalid.*contentCounter.*number/i);
            throws(() => new TimePoint(123, {scriptCounter: 'foo'}), /invalid.*scriptCounter.*number/i);
            throws(() => new TimePoint(123, {backgroundCounter: 'foo'}), /invalid.*backgroundCounter.*number/i);
        });
    });

    describe('#toJSONObject', () => {
        it('Should copy all values to a new JSON object', () => {
            const point = new TimePoint(2010203, {
                backgroundCounter: 592906,
                scriptCounter: 459876,
                contentCounter: 543210394,
            });
            const pointObject = point.toJSONObject();
            isObject(pointObject);
            deq(pointObject, {
                time: 2010203,
                backgroundCounter: 592906,
                scriptCounter: 459876,
                contentCounter: 543210394,
            });
        });
    });

    it('Should be frozen', () => {
        const point = new TimePoint(2010203, {contentCounter: 54321});

        throws(() => { point.time = 123; }, TypeError);
        throws(() => { point.contentCounter = 456; }, TypeError);
        throws(() => { point.something = 789; }, TypeError);

        eq(point.time, 2010203);
        eq(point.contentCounter, 54321);
        isNotOk('something' in point);
    });

    describe('.isTimePoint', () => {
        it('Should return true for any objects which looks like a TimePoint instance', () => {
            const point = new TimePoint(2010203, {contentCounter: 54321});
            isTrue(TimePoint.isTimePoint(new TimePoint()));
            isTrue(TimePoint.isTimePoint(point));
            isFalse(TimePoint.isTimePoint());
            isFalse(TimePoint.isTimePoint(false));
            isFalse(TimePoint.isTimePoint({}));
            isFalse(TimePoint.isTimePoint({foo: 123}));
            isFalse(TimePoint.isTimePoint(point.toJSONObject()));
        });
    });

    describe('.compare', () => {
        const isSortedLower = x => isBelow(x, 0);
        const isSortedEqual = x => eq(x, 0);
        const isSortedHigher = x => isAbove(x, 0);

        it('Should compare two TimePoint objects for sorting', () => {
            isSortedEqual(TimePoint.compare(null, null));
            isSortedLower(TimePoint.compare(null, new TimePoint(-10, {contentCounter: -10})));
            isSortedHigher(TimePoint.compare(new TimePoint(-10, {contentCounter: -10}), null));
            isSortedEqual(TimePoint.compare(new TimePoint(123, {contentCounter: 123}), new TimePoint(123, {contentCounter: 123})));
            isSortedLower(TimePoint.compare(new TimePoint(100, {contentCounter: 100}), new TimePoint(123, {contentCounter: 123})));
            isSortedHigher(TimePoint.compare(new TimePoint(123, {contentCounter: 123}), new TimePoint(100, {contentCounter: 100})));
            isSortedEqual(TimePoint.compare(new TimePoint(123, {}), new TimePoint(123, {})));
        });

        it('Should be compatible with array.sort()', () => {
            const list = [
                new TimePoint(1000, {contentCounter: 1000}),
                new TimePoint(10, {contentCounter: 10}),
                new TimePoint(-10, {contentCounter: -10}),
                null,
                new TimePoint(-10, {contentCounter: -10}),
                new TimePoint(-4000, {contentCounter: -4000}),
                null,
            ];

            list.sort(TimePoint.compare);

            eq(list[0], null);
            eq(list[1], null);
            eq(list[2].contentCounter, -4000);
            eq(list[3].contentCounter, -10);
            eq(list[4].contentCounter, -10);
            eq(list[5].contentCounter, 10);
            eq(list[6].contentCounter, 1000);
        });

        it('Should prioritize time over counters, unless the time is equal', () => {
            isSortedLower(TimePoint.compare(
                new TimePoint(100, {contentCounter: 123}),
                new TimePoint(123, {contentCounter: 100})
            ));
            isSortedLower(TimePoint.compare(
                new TimePoint(100, {contentCounter: 100}),
                new TimePoint(100, {contentCounter: 123})
            ));
            isSortedEqual(TimePoint.compare(
                new TimePoint(100),
                new TimePoint(100)
            ));
        });

        it('Should prioritize the contentCounter over other counters', () => {
            isSortedLower(TimePoint.compare(
                new TimePoint(100, {contentCounter: 100, scriptCounter: 123}),
                new TimePoint(100, {contentCounter: 123, scriptCounter: 100})
            ));
            isSortedEqual(TimePoint.compare(
                new TimePoint(100, {contentCounter: 100, scriptCounter: 123}),
                new TimePoint(100, {contentCounter: 100, scriptCounter: 100})
            ));
        });

        it('Should prioritize the scriptCounter over the backgroundCounter', () => {
            isSortedLower(TimePoint.compare(
                new TimePoint(100, {scriptCounter: 100, backgroundCounter: 123}),
                new TimePoint(100, {scriptCounter: 123, backgroundCounter: 100})
            ));
            isSortedEqual(TimePoint.compare(
                new TimePoint(100, {scriptCounter: 100, backgroundCounter: 123}),
                new TimePoint(100, {scriptCounter: 100, backgroundCounter: 100})
            ));
        });

        it('Should prioritize use the backgroundCounter if the other counters are unused', () => {
            isSortedHigher(TimePoint.compare(
                new TimePoint(100, {backgroundCounter: 123}),
                new TimePoint(100, {backgroundCounter: 100})
            ));
            isSortedEqual(TimePoint.compare(
                new TimePoint(100, {backgroundCounter: 100}),
                new TimePoint(100, {backgroundCounter: 100})
            ));
        });
    });

    it('Should store counters of different contexts separately', () => {
        const point = new TimePoint(2010203, {
            backgroundCounter: 592906,
            scriptCounter: 459876,
            contentCounter: 543210394,
        });

        eq(point.time, 2010203);
        eq(point.backgroundCounter, 592906);
        eq(point.scriptCounter, 459876);
        eq(point.contentCounter, 543210394);
    });

    describe('#add', () => {
        it('Should increment the time and all available counters', () => {
            const point = new TimePoint(123, {contentCounter: 456});
            const newPoint = point.add(1000);
            eq(point.time, 123);
            eq(point.contentCounter, 456);
            eq(newPoint.time, 1123);
            eq(newPoint.contentCounter, 1456);
            eq(newPoint.backgroundCounter, undefined);
            eq(newPoint.scriptCounter, undefined);
        });

        it('Should increment the time and all available counters', () => {
            const point = new TimePoint(123, {backgroundCounter: 456, scriptCounter: 789});
            const newPoint = point.add(-1000);
            eq(newPoint.time, -877);
            eq(newPoint.contentCounter, undefined);
            eq(newPoint.backgroundCounter, -544);
            eq(newPoint.scriptCounter, -211);
        });
    });

    describe('#diff', () => {
        it('Should return the difference between two TimePoints, using the most accurate time source', () => {
            // priorities:
            // 1. content counter (closest to the "action")
            // 2. script counter
            // 3. background counter
            // 4. time

            eq(
                new TimePoint(100, {
                    backgroundCounter: 2000,
                    scriptCounter: 30000,
                    contentCounter: 400000,
                }).diff(new TimePoint(110, {
                    backgroundCounter: 2200,
                    scriptCounter: 33000,
                    contentCounter: 440000,
                })),
                -40000
            );
            eq(
                new TimePoint(110, {
                    backgroundCounter: 2200,
                    scriptCounter: 33000,
                }).diff(new TimePoint(100, {
                    backgroundCounter: 2000,
                    scriptCounter: 30000,
                    contentCounter: 400000,
                })),
                3000
            );
            eq(
                new TimePoint(110, {
                    backgroundCounter: 2200,
                    scriptCounter: 33000,
                }).diff(new TimePoint(100, {
                    backgroundCounter: 2000,
                    contentCounter: 400000,
                })),
                200
            );
            eq(
                new TimePoint(110, {
                    backgroundCounter: 2000,
                    scriptCounter: 30000,
                    contentCounter: 400000,
                }).diff(new TimePoint(100, {})),
                10
            );
        });

        it('Should return NaN if the other TimePoint is falsy', () => {
            assert(Number.isNaN(new TimePoint(110).diff(null)));
        });
    });
});
