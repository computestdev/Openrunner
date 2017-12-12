'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
require('chai').use(require('chai-as-promised'));
const {assert: {deepEqual: deq, strictEqual: eq, throws, lengthOf, instanceOf, approximately, isRejected}} = require('chai');

const delay = require('../../../lib/delay');
const {TimePoint, replaceCounterFunc} = require('./TimePoint');
const Transaction = require('../../../runner-modules/runResult/lib/Transaction');
const Event = require('../../../runner-modules/runResult/lib/Event');
const TimePeriod = require('../../../runner-modules/runResult/lib/TimePeriod');
const RunResult = require('../../../runner-modules/runResult/lib/RunResult');

describe('RunResult', () => {
    beforeEach(() => {
        replaceCounterFunc(() => ({
            backgroundCounter: undefined,
            scriptCounter: undefined,
            contentCounter: Date.now() + 123456789,
        }));
    });

    describe('constructor', () => {
        it('Should initialize all properties', () => {
            const runResult = new RunResult();
            eq(runResult.timing.begin, null);
            eq(runResult.timing.end, null);
            deq([...runResult.events], []);
            deq([...runResult.transactions], []);
            deq(runResult.toJSONObject(), {
                timing: null,
                transactions: [],
                events: [],
            });
        });
    });

    describe('#timing', () => {
        it('Should allow setting a new value', () => {
            const runResult = new RunResult();
            const timing = new TimePeriod();
            runResult.timing = timing;
            eq(runResult.timing, timing);
        });

        it('Should throw if an invalid value is set', () => {
            const runResult = new RunResult();
            throws(() => { runResult.timing = 'foo'; }, /must.*TimePeriod/i);
        });
    });

    describe('#addEvent', () => {
        it('Should register a new event', () => {
            const runResult = new RunResult();
            const event = new Event('foo');
            runResult.addEvent(event);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });

        it('Should register a new event only once', () => {
            const runResult = new RunResult();
            const event = new Event('foo');
            runResult.addEvent(event);
            runResult.addEvent(event);
            runResult.addEvent(event);
            runResult.addEvent(event);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });

        it('Should throw for values that are not an Event', () => {
            const runResult = new RunResult();
            throws(() => runResult.addEvent(123), /must.*Event/i);
            throws(() => runResult.addEvent('asdf'), /must.*Event/i);
            throws(() => runResult.addEvent(new Event('foo').toJSONObject()), /must.*Event/i);
        });
    });

    describe('#timeEvent', () => {
        it('Should register a new event and set the timing to the given values', () => {
            const runResult = new RunResult();
            const event = runResult.timeEvent('foo', 123);
            instanceOf(event, Event);
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end, null);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });

        it('Should register a new event and set the timing to the given values', () => {
            const runResult = new RunResult();
            const event = runResult.timeEvent('foo', 123, 456);
            instanceOf(event, Event);
            eq(event.type, 'foo');
            eq(event.timing.begin.time, 123);
            eq(event.timing.end.time, 456);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });
    });

    describe('#timePointEvent', () => {
        it('Should register a new event and set the timing to the given values', () => {
            const runResult = new RunResult();
            const begin = new TimePoint(123);
            const event = runResult.timePointEvent('foo', begin);
            instanceOf(event, Event);
            eq(event.type, 'foo');
            eq(event.timing.begin, begin);
            eq(event.timing.end, null);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });

        it('Should register a new event and set the timing to the given values', () => {
            const runResult = new RunResult();
            const begin = new TimePoint(123);
            const end = new TimePoint(123);
            const event = runResult.timePointEvent('foo', begin, end);
            instanceOf(event, Event);
            eq(event.type, 'foo');
            eq(event.timing.begin, begin);
            eq(event.timing.end, end);
            const events = [...runResult.events];
            lengthOf(events, 1);
            eq(events[0], event);
        });
    });

    describe('#execEvent', () => {
        it('Should create a new event and base its timing on the given async callback', {slow: 500}, async () => {
            const runResult = new RunResult();
            let eventDuringCallback;
            const returnValue = await runResult.execEvent('foo', async event => {
                eventDuringCallback = event;
                eq(event.timing.isPending, true);
                await delay(200);
                return 123;
            });
            instanceOf(eventDuringCallback, Event);
            eq(eventDuringCallback.timing.isComplete, true);
            eq(returnValue, 123);
            approximately(eventDuringCallback.timing.duration, 200, 50);
        });

        it('Should store and rethrow rejections', async () => {
            const runResult = new RunResult();
            let eventDuringCallback;
            const execEventPromise = runResult.execEvent('foo', async event => {
                eventDuringCallback = event;
                const err = Error('Error from test!');
                err.name = 'FooError';
                throw err;
            });
            await isRejected(execEventPromise, 'Error from test!');
            eq(eventDuringCallback.timing.isComplete, true);
            const errorObject = eventDuringCallback.getMetaData('error');
            eq(errorObject.message, 'Error from test!');
            eq(errorObject.name, 'FooError');
        });

        it('Should allow the event timing to be ended early', async () => {
            const runResult = new RunResult();
            let eventDuringCallback;
            await runResult.execEvent('foo', async event => {
                eventDuringCallback = event;
                event.timing.endAtTime(123);
            });
            eq(eventDuringCallback.timing.isComplete, true);
            eq(eventDuringCallback.timing.end.time, 123);
        });

        it('Should be able to handle an inaccessible error object', async () => {
            // this can happen with errors from a different sandboxed realm
            const runResult = new RunResult();
            let eventDuringCallback;
            const execEventPromise = runResult.execEvent('foo', async event => {
                eventDuringCallback = event;
                const err = Error('Error from test!');
                Object.defineProperty(err, 'stack', {
                    get() {
                        throw Error('Another error from test; in the getter of the `stack` property');
                    },
                    set(value) {
                    },
                });
                throw err;
            });
            await isRejected(execEventPromise, 'Error from test!');
            eq(eventDuringCallback.timing.isComplete, true);
            const errorObject = eventDuringCallback.getMetaData('error');
            eq(errorObject.message, 'Error from test!');
            eq(errorObject.stack, '###inaccessible###');
        });
    });

    describe('#transaction', () => {
        it('Should create and register a new transaction', async () => {
            const runResult = new RunResult();
            eq(await runResult.transaction('Foo'), undefined);
            const transactions = [...runResult.transactions];
            lengthOf(transactions, 1);
            eq(transactions[0].id, 'Foo');
            eq(transactions[0].timing.isCleared, true);
        });

        it('Should throw for duplicate transaction id\'s', async () => {
            const runResult = new RunResult();
            await runResult.transaction('Foo');
            await isRejected(runResult.transaction('Foo'), /transaction.*id.*Foo.*already.*exist/i);
            lengthOf([...runResult.transactions], 1);
        });

        it('Should base its timing on the execution of the given callback', {slow: 500}, async () => {
            const runResult = new RunResult();
            let transDuringCallback;
            const returnValue = await runResult.transaction('Foo', async trans => {
                transDuringCallback = trans;
                eq(trans.timing.isPending, true);
                await delay(200);
                return 123;
            });
            eq(returnValue, 123);
            instanceOf(transDuringCallback, Transaction);
            eq(transDuringCallback.timing.isComplete, true);
            approximately(transDuringCallback.timing.duration, 200, 50);
        });

        it('Should store and rethrow rejections', async () => {
            const runResult = new RunResult();
            const err = Error('Error from test!');
            err.name = 'FooError';

            let transDuringCallback;
            const execEventPromise = runResult.transaction('Foo', async trans => {
                transDuringCallback = trans;
                throw err;
            });
            await isRejected(execEventPromise, 'Error from test!');
            eq(transDuringCallback.timing.isComplete, true);
            eq(transDuringCallback.error, err);
        });

        it('Should not rethrow errors if eatError is set to true', async () => {
            const runResult = new RunResult();
            const err = Error('Error from test!');
            err.name = 'FooError';

            let transDuringCallback;
            await runResult.transaction('Foo', async trans => {
                trans.eatError = true;
                transDuringCallback = trans;
                throw err;
            });
            eq(transDuringCallback.timing.isComplete, true);
            eq(transDuringCallback.error, err);
        });

        it('Should allow the event timing to be ended early', async () => {
            const runResult = new RunResult();
            let transDuringCallback;
            await runResult.transaction('Foo', async event => {
                transDuringCallback = event;
                event.timing.endAtTime(123);
            });
            eq(transDuringCallback.timing.isComplete, true);
            eq(transDuringCallback.timing.end.time, 123);
        });
    });

    describe('#setPendingTransactionError', () => {
        it('Should set the error property of all transactions with a pending timing', async () => {
            const runResult = new RunResult();
            const pendingPromise = new Promise(() => {});
            const err = Error('Error from test!');
            const pendingError = Error('Second Error from test! (pending)');

            await runResult.transaction('Foo'); // cleared
            runResult.transaction('Bar', () => pendingPromise); // pending
            runResult.transaction('Baz', trans => {
                trans.error = err;
                return pendingPromise;
            }); // pending with error already set
            await runResult.transaction('Quux', () => {}); // complete

            runResult.setPendingTransactionError(pendingError);
            const transactions = [...runResult.transactions];
            eq(transactions[0].id, 'Foo');
            eq(transactions[1].id, 'Bar');
            eq(transactions[2].id, 'Baz');
            eq(transactions[3].id, 'Quux');

            eq(transactions[0].error, null);
            eq(transactions[1].error, pendingError);
            eq(transactions[2].error, err);
            eq(transactions[3].error, null);
        });
    });

    describe('#toJSONObject', () => {
        it('Should copy all values to a new JSON object', () => {
            const runResult = new RunResult();
            runResult.timing.begin = new TimePoint(100);
            runResult.timing.end = new TimePoint(200);
            runResult.transaction('Trans1', t => {
                t.timing.begin = new TimePoint(400);
                t.timing.end = new TimePoint(500);
            });
            runResult.transaction('Trans2', t => {
                t.timing.begin = new TimePoint(300);
                t.timing.end = new TimePoint(900);
            });
            runResult.transaction('Trans3', t => {
                t.timing.begin = new TimePoint(600);
                t.timing.end = new TimePoint(700);
            });
            runResult.timeEvent('Event1', 7000, 8000);
            runResult.timeEvent('Event2', 7000, 8000);
            runResult.timeEvent('Event3', 5000, 10000);

            // (transactions and events should be sorted by their begin time)
            deq(runResult.toJSONObject(), {
                timing: {
                    begin: {
                        time: 100,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                    duration: 100,
                    end: {
                        time: 200,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                },
                transactions: [
                    {
                        id: 'Trans2',
                        title: 'Trans2',
                        timing: {
                            begin: {
                                time: 300,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 600,
                            end: {
                                time: 900,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                    {
                        id: 'Trans1',
                        title: 'Trans1',
                        timing: {
                            begin: {
                                time: 400,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 100,
                            end: {
                                time: 500,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                    {
                        id: 'Trans3',
                        title: 'Trans3',
                        timing: {
                            begin: {
                                time: 600,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 100,
                            end: {
                                time: 700,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                ],
                events: [
                    {
                        type: 'Event3',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 5000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 5000,
                            end: {
                                time: 10000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                    {
                        type: 'Event1',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 7000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 1000,
                            end: {
                                time: 8000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                    {
                        type: 'Event2',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 7000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 1000,
                            end: {
                                time: 8000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                ],
            });
        });

        it('Should merge the result from other run result json objects', () => {
            const runResult1 = new RunResult();
            const runResult2 = new RunResult();
            const runResult3 = new RunResult();

            runResult1.timing.begin = new TimePoint(100);
            runResult1.timing.end = new TimePoint(200);
            runResult2.timing.begin = new TimePoint(110);
            runResult2.timing.end = new TimePoint(190);
            runResult1.transaction('Trans1', t => {
                t.timing.begin = new TimePoint(400);
                t.timing.end = new TimePoint(500);
            });
            runResult2.transaction('Trans2', t => {
                t.timing.begin = new TimePoint(300);
                t.timing.end = new TimePoint(900);
            });
            runResult1.transaction('Trans3', t => {
                t.timing.begin = new TimePoint(600);
                t.timing.end = new TimePoint(700);
            });
            runResult3.timeEvent('Event1', 7000, 8000);
            runResult1.timeEvent('Event2', 7001, 8000);
            runResult2.timeEvent('Event3', 5000, 10000);

            runResult2.transaction('Trans1', t => { // duplicate! runResult1 already contains this one
                t.timing.begin = new TimePoint(40000);
                t.timing.end = new TimePoint(500);
            });

            runResult1.mergeJSONObject(runResult2.toJSONObject());
            runResult1.mergeJSONObject(runResult3.toJSONObject());

            deq(runResult1.toJSONObject(), {
                timing: {
                    begin: {
                        time: 100,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                    duration: 100,
                    end: {
                        time: 200,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                },
                transactions: [
                    {
                        id: 'Trans2',
                        title: 'Trans2',
                        timing: {
                            begin: {
                                time: 300,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 600,
                            end: {
                                time: 900,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                    {
                        id: 'Trans1',
                        title: 'Trans1',
                        timing: {
                            begin: {
                                time: 400,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 100,
                            end: {
                                time: 500,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                    {
                        id: 'Trans3',
                        title: 'Trans3',
                        timing: {
                            begin: {
                                time: 600,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 100,
                            end: {
                                time: 700,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        error: null,
                    },
                ],
                events: [
                    {
                        type: 'Event3',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 5000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 5000,
                            end: {
                                time: 10000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                    {
                        type: 'Event1',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 7000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 1000,
                            end: {
                                time: 8000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                    {
                        type: 'Event2',
                        shortTitle: '',
                        longTitle: '',
                        comment: '',
                        id: null,
                        timing: {
                            begin: {
                                time: 7001,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                            duration: 999,
                            end: {
                                time: 8000,
                                backgroundCounter: undefined,
                                contentCounter: undefined,
                                scriptCounter: undefined,
                            },
                        },
                        metaData: {},
                        children: [],
                        tabId: null,
                        tabContentId: null,
                    },
                ],
            });
        });

        it('Should set the RunResult timing only if ours is cleared', () => {
            const runResult1 = new RunResult();
            const runResult2 = new RunResult();
            const runResult3 = new RunResult();

            runResult2.timing.begin = new TimePoint(110);
            runResult2.timing.end = new TimePoint(190);

            runResult1.mergeJSONObject(runResult2.toJSONObject());
            runResult1.mergeJSONObject(null);
            runResult1.mergeJSONObject(runResult3.toJSONObject());

            eq(runResult1.timing.isCleared, true);

            deq(runResult1.toJSONObject(), {
                timing: {
                    begin: {
                        time: 110,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                    duration: 80,
                    end: {
                        time: 190,
                        backgroundCounter: undefined,
                        contentCounter: undefined,
                        scriptCounter: undefined,
                    },
                },
                transactions: [],
                events: [],
            });
        });

        it('Should throw if the same object is merged multiple times', () => {
            const runResult1 = new RunResult();
            const runResult2 = new RunResult();
            const obj = runResult2.toJSONObject();

            runResult1.mergeJSONObject(obj);
            throws(() => runResult1.mergeJSONObject(obj), /object.*already.*merge/i);
        });
    });
});
