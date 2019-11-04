'use strict';

const {illegalArgumentError} = require('../../../lib/scriptErrors');
const Event = require('./Event');
const TimePoint = require('./TimePoint');
const Transaction = require('./Transaction');
const TimePeriod = require('./TimePeriod');
const errorToObject = require('../../../lib/errorToObject');

const PRIVATE = Symbol('RunResultBase PRIVATE');

class RunResult {
    constructor() {
        this[PRIVATE] = Object.seal({
            timing: new TimePeriod(),
            events: new Set(),
            transactions: new Map(), // id => Transaction (insertion order)
            mergeResults: [],
        });
        Object.freeze(this);
    }

    /**
     * The time period for this script run. The begin and end time must be set explicitly.
     * @return {TimePeriod}
     */
    get timing() {
        return this[PRIVATE].timing;
    }

    /**
     * The time period for this script run. The begin and end time must be set explicitly.
     * @param {TimePeriod} value
     */
    set timing(value) {
        if (!TimePeriod.isTimePeriod(value)) {
            throw illegalArgumentError('RunResult.timing: Value must be a TimePeriod');
        }

        this[PRIVATE].timing = value;
    }

    /**
     * Add an event to this run result
     * @param {!Event} event
     * @return {Event} Same value as `event` argument
     */
    addEvent(event) {
        if (!Event.isEvent(event)) {
            throw illegalArgumentError('RunResult.addEvent: First argument must be an Event instance');
        }

        this[PRIVATE].events.add(event);
        return event;
    }

    /**
     * Create an event and add it to this run result
     * @param {!String} type
     * @param {!number} beginTime Unix time in Milliseconds, see Date.now()
     * @param {?number} [endTime=null] Unix time in Milliseconds, see Date.now()
     * @return {Event}
     */
    timeEvent(type, beginTime, endTime = null) {
        const event = Event.fromTime(type, beginTime, endTime);
        return this.addEvent(event);
    }

    /**
     * Create an event and add it to this run result
     * @param {!String} type
     * @param {!TimePoint} beginTimePoint
     * @param {?TimePoint} [endTimePoint=null]
     * @return {Event}
     */
    timePointEvent(type, beginTimePoint, endTimePoint = null) {
        const event = Event.fromTimePoint(type, beginTimePoint, endTimePoint);
        return this.addEvent(event);
    }

    /**
     * Create a new event and add to this run result. The timing measures the execution of the
     * async `body` callback function (which is called immediately).
     *
     * @param {string} type
     * @param {Function} body
     * @return {Promise.<*>} The resolved return value of `body`
     */
    async execEvent(type, body) {
        const event = new Event(type);
        this.addEvent(event);

        let bodyReturn = undefined;
        let bodyError = null;

        event.timing.beginNow();

        try {
            bodyReturn = await body(event);
        }
        catch (err) {
            bodyError = err;
        }

        if (event.timing.isPending) {
            event.timing.endNow();
        }

        event.setMetaData('error', errorToObject(bodyError));

        if (bodyError) {
            throw bodyError;
        }

        return bodyReturn;
    }

    /**
     * @return {Iterator.<Event>}
     */
    get events() {
        return this[PRIVATE].events.values();
    }

    /**
     * A function which will be executed immediately by RunResult::transaction()
     *
     * @callback TransactionExecutionBody
     * @param {Transaction} transaction
     * @return {Promise}
     */

    /**
     * Create a new Transaction and register it within this RunResult.
     *
     * A function can be specified which will be executed immediately; The start and completion time of that function will determine the
     * transaction begin/end timestamps.
     *
     * @param {string} id A unique identifier for this transaction
     * @param {?TransactionExecutionBody} body A function which will be executed immediately. The first argument to this function is the
     *        Transaction which was just created. This function may optionally return a Promise.
     * @return {Promise<Transaction>} A promise which will be resolved when the transaction has been created, AND when the `body`
     *          function has been resolved.
     */
    async transaction(id, body = null) {
        // await result.transaction('id', t => async { t.title = 'Fancy title'; await doStuff(); });

        const transaction = new Transaction(id);

        if (this[PRIVATE].transactions.has(transaction.id)) {
            throw illegalArgumentError(
                `RunResult.transaction: A transaction with id "${transaction.id}" already exists. Transaction id's must be unique.`,
            );
        }

        this[PRIVATE].transactions.set(transaction.id, transaction);

        let bodyReturn = undefined;
        let bodyError = null;

        if (body) {
            transaction.beginNow();

            try {
                bodyReturn = await body(transaction);
            }
            catch (err) {
                bodyError = err;
                // todo add this transaction id to the error data
            }

            if (transaction.isPending) {
                transaction.endNow();
            }
            transaction.error = bodyError;
        }

        if (bodyError && !transaction.eatError) {
            throw bodyError;
        }

        return bodyReturn;
    }

    /**
     * @return {Iterator.<Transaction>}
     */
    get transactions() {
        return this[PRIVATE].transactions.values();
    }

    /**
     * Assign the given `error` to all transactions that are still pending (they have no end time).
     * Unless the transaction already has an error assigned.
     * @param {Error} error
     */
    setPendingTransactionError(error) {
        for (const transaction of this.transactions) {
            if (transaction.isPending && !transaction.error) {
                transaction.error = error;
                // do not set the end time. conceptually the transaction is still pending, it was never completed because of some
                // catastrophic error!
            }
        }
    }

    /**
     * Merge the object returned by `toJSONObject` from a different RunResult
     * @param {Object} runResultJsonObject
     */
    mergeJSONObject(runResultJsonObject) {
        if (runResultJsonObject) { // the object is null if the script quit prematurely
            const {mergeResults} = this[PRIVATE];
            if (mergeResults.includes(runResultJsonObject)) {
                // a small check to avoid typo's
                throw illegalArgumentError('RunResult.mergeJSONObject: This object has already been merged');
            }

            mergeResults.push(runResultJsonObject);
        }
    }

    /**
     * @return {{
     *   timing: ({
     *       begin: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *       end: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *       duration: number
     *   }),
     *   transactions: Array,
     *   events: Array
     * }}
     */
    toJSONObject() {
        const {mergeResults} = this[PRIVATE];
        const myTiming = this.timing.isCleared ? null : this.timing.toJSONObject();


        let events = [];
        for (const event of this.events) {
            events.push(event.toJSONObject());
        }
        events = events.concat(...mergeResults.map(result => result.events));
        events.sort((a, b) => TimePoint.compare(a.timing.begin, b.timing.begin));


        let transactions = [];
        for (const transaction of this.transactions) {
            transactions.push(transaction.toJSONObject());
        }
        transactions = transactions.concat(...mergeResults.map(result => result.transactions));
        // last resort to enforce unique transaction id's
        // We try to throw errors for these at creation, however this check is not
        // cross-process (which would be too expensive)
        const seenTransactionIds = new Set();
        transactions = transactions.filter(transaction => {
            const seen = seenTransactionIds.has(transaction.id);
            seenTransactionIds.add(transaction.id);
            return !seen;
        });
        transactions.sort((a, b) => TimePoint.compare(a.timing.begin, b.timing.begin));

        return {
            timing: myTiming || mergeResults.reduce((previous, result) => result.timing || previous, null),
            transactions,
            events,
        };
    }
}

// convenience so that we can access all the functionality of a RunResult instance without having to pass the entire module:
RunResult.prototype.TimePoint = TimePoint;
RunResult.prototype.TimePeriod = TimePeriod;
RunResult.prototype.Event = Event;
RunResult.prototype.Transaction = Transaction;

Object.freeze(RunResult);
Object.freeze(RunResult.prototype);

module.exports = RunResult;
