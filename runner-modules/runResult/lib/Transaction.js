'use strict';

const TimePeriod = require('./TimePeriod');
const errorToObject = require('../../../lib/errorToObject');

const PRIVATE = Symbol();

/**
 * A transaction is a time period defined by the scripter, usually based on how fast a group of commands  execute (sync/async).
 *
 * Each transaction must have a unique "id". The id should not be modified to make sure results of previous script runs can be matched
 * with the current one. An optional "title" can be set to change how the transaction is displayed in result interpreting GUIs (e.g. a
 * chart).
 *
 * A transaction may optionally contain statistics for the time period it represents (for example cpu usage)
 */
class Transaction {
    constructor(id) {
        this[PRIVATE] = Object.seal({
            eatError: false,
            error: null,
            id: String(id),
            timing: new TimePeriod(),
            title: String(id),
        });
        Object.freeze(this);
    }

    /**
     * The unique transaction id.
     *
     * @return {string}
     */
    get id() {
        return this[PRIVATE].id;
    }

    /**
     * A title which can be used to the user when displaying the transaction results in a GUI (e.g. a chart). If the scripter does not
     * define a title, the id will be returned instead.
     *
     * @return {string}
     */
    get title() {
        return this[PRIVATE].title;
    }

    /**
     *
     * @param {string} value
     */
    set title(value) {
        this[PRIVATE].title = String(value);
    }

    /**
     * The time period that this transaction represents. This value is never null, however the TimePeriod itself might have null
     * begin/end TimePoint's. For example, if a transaction is still on going, the "begin" is set, but the "end" will be null.
     *
     * @return {TimePeriod}
     */
    get timing() {
        return this[PRIVATE].timing;
    }

    /**
     * The time period that this transaction represents. This value is never null, however the TimePeriod itself might have null
     * begin/end TimePoint's. For example, if a transaction is still on going, the "begin" is set, but the "end" will be null.
     *
     * @param {TimePeriod} value
     */
    set timing(value) {
        if (!TimePeriod.isTimePeriod(value)) {
            throw Error('Value must be a TimePeriod');
        }

        this[PRIVATE].timing = value;
    }

    /**
     * Begin the transaction. The "begin" of the TimePeriod is set to the current time.
     *
     * @throws {Error} If this method is called in an invalid state (for example if the transaction has already been completed)
     */
    beginNow() {
        this.timing.beginNow();
    }

    /**
     * End the transaction. The "end" of the TimePeriod is set to the current time.
     *
     * @throws {Error} If this method is called in an invalid state (for example if the transaction has already been completed)
     */
    endNow() {
        this.timing.endNow();
    }

    /**
     * Is the transaction currently pending?. In this case the TimePeriod only has a begin TimePoint.
     *
     * @return {boolean}
     */
    get isPending() {
        return this.timing.isPending;
    }

    /**
     * @return {?Error} The error encountered during the transaction or null if there was no error
     */
    get error() {
        return this[PRIVATE].error;
    }

    /**
     * @param {?Error} err The error encountered during the transaction or null if there was no error
     */
    set error(err) {
        const tag = Object.prototype.toString.call(err); // also see Symbol.toStringTag

        if (err !== null &&
            (typeof err !== 'object' ||
             typeof err.name !== 'string' ||
             typeof err.message !== 'string')
        ) {
            let errorToString = '';

            try {
                errorToString = err.toString();
            }
            catch (e) {
            }

            throw Error(`Invalid argument, must be instance of Error, or null: ${tag} ${errorToString}`);
        }
        this[PRIVATE].error = err;
    }

    /**
     * Returns the value of the "eatError" mode (false by default).
     *
     * If enabled, Errors thrown by your transaction body function (second argument of RunResult::transaction) will be caught instead of
     * being rethrown. If disabled, any Error during your transaction will usually result in the end of the entire script run.
     *
     * Note that the error information will be stored regardless of the "eatError" mode.
     *
     * @return {boolean}
     */
    get eatError() {
        return this[PRIVATE].eatError;
    }

    /**
     * Sets the value of the "eatError" mode (false by default).
     *
     * If enabled, Errors thrown by your transaction body function (second argument of RunResult::transaction) will be caught instead of
     * being rethrown. If disabled, any Error during your transaction will usually result in the end of the entire script run.
     *
     * Note that the error information will be stored regardless of the "eatError" mode.
     *
     * @param {boolean} value
     */
    set eatError(value) {
        this[PRIVATE].eatError = Boolean(value);
    }

    /**
     * @return {{
     *     error: {columnNumber: number, fileName: string, lineNumber: number, message: string, name: string, stack: string},
     *     id: string,
     *     timing: {
     *         begin: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *         end: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *         duration: number
     *     },
     *     title: string
     * }}
     */
    toJSONObject() {
        // Firefox appears to maintain key order, so put the keys in an order that makes it more convenient to read the resulting json
        /* eslint-disable sort-keys */
        return {
            id: this.id,
            title: this.title,
            timing: this.timing.toJSONObject(),
            error: errorToObject(this.error),
        };
        /* eslint-enable sort-keys */
    }
}

Object.freeze(Transaction.prototype);
Object.freeze(Transaction);

module.exports = Transaction;
