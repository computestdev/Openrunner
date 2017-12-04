'use strict';

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
     * Add an event to this run result
     * @param {!Event} event
     * @return {Event} Same value as `event` argument
     */
    addEvent(event) {
        if (!Event.isEvent(event)) {
            throw Error('First argument must be an Event instance');
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

        try {
            event.setMetaData('error', errorToObject(bodyError));
        }
        catch (err) {
            // security error accessing bodyError; make sure we do not replace the original error
        }

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
            throw Error(`A transaction with id "${transaction.id}" already exists. Transaction id's must be unique.`);
        }

        this[PRIVATE].transactions.set(transaction.id, transaction);

        let bodyError = null;

        if (body) {
            transaction.beginNow();

            try {
                await body(transaction);
            }
            catch (err) {
                bodyError = err;
                // todo add thsi transaction id to the error data
            }

            if (transaction.isPending) {
                transaction.endNow();
            }
            transaction.error = bodyError;
        }

        if (bodyError && !transaction.eatError) {
            throw bodyError;
        }

        return transaction;
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
                throw Error('This object has already been merged');
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
        // Firefox maintains key order, so put the keys in an order that makes it more convenient to read the resulting json
        /* eslint-disable sort-keys */

        const myTiming = this.timing.isCleared ? null : this.timing.toJSONObject();

        const result = {
            timing: myTiming || mergeResults.reduce((previous, result) => result.timing || previous, null),
            transactions: [].concat(...mergeResults.map(result => result.transactions)),
            events: [].concat(...mergeResults.map(result => result.events)),
        };
        /* eslint-enable sort-keys */

        for (const event of this.events) {
            result.events.push(event.toJSONObject());
        }

        for (const transaction of this.transactions) {
            result.transactions.push(transaction.toJSONObject());
        }

        // last resort to enforce unique transaction id's
        // We try to throw errors for these at creation, however this check is not
        // cross-process (which would be too expensive)
        const seenTransactionIds = new Set();
        result.transactions = result.transactions.filter(transaction => {
            const seen = seenTransactionIds.has(transaction.id);
            seenTransactionIds.add(transaction.id);
            return !seen;
        });

        result.transactions.sort((a, b) => TimePoint.compare(a.timing.begin, b.timing.begin));
        result.events.sort((a, b) => TimePoint.compare(a.timing.begin, b.timing.begin));

        return result;
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
