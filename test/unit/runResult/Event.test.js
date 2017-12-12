'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert: {
    deepEqual: deq, strictEqual: eq, isTrue, ok, isNull, lengthOf, throws, instanceOf, isArray, notEqual,
}} = require('chai');

const {TimePoint, replaceCounterFunc} = require('./TimePoint');
const TimePeriod = require('../../../runner-modules/runResult/lib/TimePeriod');
const Event = require('../../../runner-modules/runResult/lib/Event');

describe('Event', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    describe('constructor', () => {
        it('Should set the type and initialize all properties', () => {
            const event = new Event('my type');
            eq(event.type, 'my type');
            isTrue(TimePeriod.isTimePeriod(event.timing));
            isTrue(event.timing.isCleared);
            lengthOf([...event.children], 0);
            eq(event.comment, '');
            eq(event.longTitle, '');
            eq(event.shortTitle, '');
            isNull(event.tabId);
            isNull(event.tabContentId);
            lengthOf([...event.metaData], 0);
            isNull(event.getMetaData('foo'));
            ok(Object.isFrozen(event));
        });
    });

    describe('#type', () => {
        it('Should not be mutable', () => {
            const event = new Event('my type');
            throws(() => { event.type = 'foo'; });
            eq(event.type, 'my type');
        });
    });

    describe('Simple getters/setters for string properties', () => {
        it('Should properly store correct values', () => {
            const event = new Event('my type');
            event.comment = 'my comment!';
            event.shortTitle = 'my short title';
            event.longTitle = 'my very looooong title';
            event.tabId = 'f1234';
            event.tabContentId = 'f6574';

            eq(event.comment, 'my comment!');
            eq(event.shortTitle, 'my short title');
            eq(event.longTitle, 'my very looooong title');
            eq(event.tabId, 'f1234');
            eq(event.tabContentId, 'f6574');
        });

        it('Should stringify when setting', () => {
            const event = new Event('my type');
            event.comment = 123;
            event.shortTitle = 456;
            event.longTitle = 789;
            event.tabId = 1234;
            event.tabContentId = 5678;

            eq(event.comment, '123');
            eq(event.shortTitle, '456');
            eq(event.longTitle, '789');
            eq(event.tabId, '1234');
            eq(event.tabContentId, '5678');
        });

        it('Should convert falsy to null for tabId and tabContentId', () => {
            const event = new Event('my type');
            event.tabId = null;
            event.tabContentId = false;
            eq(event.tabId, null);
            eq(event.tabContentId, null);
        });
    });

    describe('#timing', () => {
        it('Should allow setting a new value', () => {
            const event = new Event('my type');
            const timing = new TimePeriod();
            event.timing = timing;
            eq(event.timing, timing);
        });

        it('Should throw if an invalid value is set', () => {
            const event = new Event('my type');
            throws(() => { event.timing = 'foo'; }, /must.*TimePeriod/i);
        });
    });

    describe('#getMetaData & #setMetaData', () => {
        it('Should throw for keys that are not strings', () => {
            const event = new Event('my type');
            throws(() => { event.getMetaData(123); }, /must.*string/i);
            throws(() => { event.setMetaData(123, 'foo'); }, /must.*string/i);
        });

        it('Should set and clone any json compatible value', () => {
            const event = new Event('my type');

            event.setMetaData('foo', 'bar');
            eq(event.getMetaData('foo'), 'bar');
            const obj = {bar: 123, baz: {quux: 456}};
            event.setMetaData('foo2', obj);
            notEqual(event.getMetaData('foo2'), obj, 'should have been cloned');
            deq(event.getMetaData('foo2'), obj);
            obj.bar = -1;
            obj.baz.quux = -2;
            eq(event.getMetaData('foo2').bar, 123);
            eq(event.getMetaData('foo2').baz.quux, 456);
            throws(() => { event.getMetaData('foo2').bar = -1000; },  TypeError);
            eq(event.getMetaData('foo2').bar, 123);

            const metaData = [...event.metaData];
            lengthOf(metaData, 2);
            isArray(metaData[0]);
            isArray(metaData[1]);
            lengthOf(metaData[0], 2);
            lengthOf(metaData[1], 2);

            eq(metaData[0][0], 'foo');
            eq(metaData[0][1], 'bar');
            eq(metaData[1][0], 'foo2');
            deq(metaData[1][1], {bar: 123, baz: {quux: 456}});
        });

        it('Should convert undefined to null', () => { // (special case in JSON.stringify)
            const event = new Event('my type');
            event.setMetaData('foo', undefined);
            eq(event.getMetaData('foo'), null);
        });
    });

    describe('#toJSONObject', () => {
        it('Should copy all values to a new JSON object', () => {
            const event = new Event('my type');
            event.timing.begin = new TimePoint(1000, {contentCounter: 5001000});
            event.timing.end = new TimePoint(5000, {contentCounter: 5005000});
            event.comment = 'my comment!';
            event.shortTitle = 'my short title';
            event.longTitle = 'my very looooong title';
            event.tabId = 'f1234';
            event.tabContentId = 'f6574';
            event.addChild(new Event('child type'));
            event.setMetaData('foo', 'bar');
            const foo2 = {bar: 123, baz: {quux: 456}};
            event.setMetaData('foo2', foo2);

            const eventObject = event.toJSONObject();
            deq(eventObject, {
                type: 'my type',
                shortTitle: 'my short title',
                longTitle: 'my very looooong title',
                comment: 'my comment!',
                id: null,
                timing: {
                    begin: {
                        backgroundCounter: undefined,
                        scriptCounter: undefined,
                        contentCounter: 5001000,
                        time: 1000,
                    },
                    duration: 4000,
                    end: {
                        backgroundCounter: undefined,
                        scriptCounter: undefined,
                        contentCounter: 5005000,
                        time: 5000,
                    },
                },
                metaData: {
                    foo: 'bar',
                    foo2: {
                        bar: 123,
                        baz: {
                            quux: 456,
                        },
                    },
                },
                children: [
                    {
                        type: 'child type',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: null,
                            duration: NaN,
                            end: null,
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                ],
                tabId: 'f1234',
                tabContentId: 'f6574',
            });

            // toJSONObject() should clone everything:
            eventObject.metaData.foo = 'asdf';
            eq(event.getMetaData('foo'), 'bar');
        });

        it('Should sort all child events by their begin time', () => {
            const event = new Event('my type');
            event.childTimeEvent('child type for #1', 2120, 2121);
            event.childTimeEvent('child type for #2', 4900);
            event.childTimeEvent('child type for #3', 1524);
            event.childTimeEvent('child type for #4', 23395, 10);

            const eventObject = event.toJSONObject();
            eq(eventObject.children[0].type, 'child type for #3');
            eq(eventObject.children[1].type, 'child type for #1');
            eq(eventObject.children[2].type, 'child type for #2');
            eq(eventObject.children[3].type, 'child type for #4');
            lengthOf(eventObject.children, 4);
        });
    });

    describe('.fromTimePoint', () => {
        it('Should create a new event using the given begin TimePoint', () => {
            const event = Event.fromTimePoint('foo', new TimePoint(123));
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end, null);
        });

        it('Should create a new event using the given begin and end TimePoint', () => {
            const event = Event.fromTimePoint('foo', new TimePoint(123), new TimePoint(456));
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end.time, 456);
        });
    });

    describe('.fromTime', () => {
        it('Should create a new event using the given begin time', () => {
            const event = Event.fromTime('foo', 123);
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end, null);
        });

        it('Should create a new event using the given begin and end time', () => {
            const event = Event.fromTime('foo', 123, 456);
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end.time, 456);
        });

        it('Should throw for invalid arguments', () => {
            throws(() => Event.fromTime('foo', 'bar'), /beginTime.*must.*number/i);
            throws(() => Event.fromTime('foo', 123, 'bar'), /endTime.*must.*number/i);
        });
    });

    describe('Child events', () => {
        it('Should not accept invalid types as children', () => {
            const event = new Event('my type');
            throws(() => { event.addChild(null); }, /must.*Event/i);
            throws(() => { event.addChild(123); }, /must.*Event/i);
        });

        describe('#addChild', () => {
            it('Should provide an explicit method to add children', () => {
                const event = new Event('my type');

                const child1 = new Event('child type');
                child1.timing.begin = new TimePoint(2000, {contentCounter: 5002000});
                child1.timing.end = new TimePoint(2100, {contentCounter: 5002100});
                event.addChild(child1);
                lengthOf([...event.children], 1);
                eq([...event.children][0], child1);

                const child2 = new Event('another child');
                event.addChild(child2);
                lengthOf([...event.children], 2);
                eq([...event.children][0], child1);
                eq([...event.children][1], child2);
            });
        });

        describe('#childTimePointEvent', () => {
            it('Should add a new child with the given begin TimePoint', () => {
                const event = new Event('my type');
                const child = event.childTimePointEvent(
                    'child type',
                    new TimePoint(2150, {contentCounter: 5002150})
                );
                instanceOf(child, Event);
                lengthOf([...event.children], 1);
                eq([...event.children][0], child);
                eq(child.timing.begin.time, 2150);
                eq(child.timing.end, null);
            });

            it('Should add a new child with the given begin and end TimePoint', () => {
                const event = new Event('my type');
                const child = event.childTimePointEvent(
                    'child type',
                    new TimePoint(2150, {contentCounter: 5002150}),
                    new TimePoint(2200, {contentCounter: 5002200})
                );
                instanceOf(child, Event);
                lengthOf([...event.children], 1);
                eq([...event.children][0], child);
                eq(child.timing.begin.time, 2150);
                eq(child.timing.end.time, 2200);
            });
        });

        describe('#childTimeEvent', () => {
            it('Should add a new child with the given begin time', () => {
                const event = new Event('my type');
                const child = event.childTimeEvent(
                    'child type',
                    2120
                );
                instanceOf(child, Event);
                lengthOf([...event.children], 1);
                eq([...event.children][0], child);
                eq(child.timing.begin.time, 2120);
                eq(child.timing.end, null);
            });
            it('Should add a new child with the given begin and end time', () => {
                const event = new Event('my type');
                const child = event.childTimeEvent(
                    'child type',
                    2120,
                    2121
                );
                instanceOf(child, Event);
                lengthOf([...event.children], 1);
                eq([...event.children][0], child);
                eq(child.timing.begin.time, 2120);
                eq(child.timing.end.time, 2121);
            });
        });
    });
});
