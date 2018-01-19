'use strict';
const {illegalArgumentError, illegalStateError} = require('../../../lib/scriptErrors');
const TimePoint = require('./TimePoint');

const PRIVATE = Symbol();

class TimePeriod {
    /**
     * Does the given value look like a TimePeriod?.
     *
     * @param {*} object
     * @return {boolean}
     */
    static isTimePeriod(object) {
        return Boolean(
            object &&
            (object.begin === null || TimePoint.isTimePoint(object.begin)) &&
            (object.end === null || TimePoint.isTimePoint(object.end)) &&
            typeof object.toJSONObject === 'function'
        );
    }

    /**
     * @param {?TimePoint} [begin=null]
     * @param {?TimePoint} [end=null]
     */
    constructor(begin = null, end = null) {
        this[PRIVATE] = Object.seal({
            begin: null,
            end: null,
        });

        this.begin = begin || null;
        this.end = end || null;

        Object.freeze(this);
    }

    /**
     * @return {{
     *     begin: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *     end: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *     duration: number
     * }}
     */
    toJSONObject() {
        return {
            begin: this.begin && this.begin.toJSONObject(),
            duration: this.duration,
            end: this.end && this.end.toJSONObject(),
        };
    }

    /**
     * @return {?TimePoint}
     */
    get begin() {
        return this[PRIVATE].begin;
    }

    /**
     * @param {?TimePoint} value
     */
    set begin(value) {
        if (value && !TimePoint.isTimePoint(value)) {
            throw illegalArgumentError('TimePeriod.begin: Value must be null or a TimePoint');
        }

        this[PRIVATE].begin = value || null;
    }

    /**
     * @return {?TimePoint}
     */
    get end() {
        return this[PRIVATE].end;
    }

    /**
     * @param {?TimePoint} value
     */
    set end(value) {
        if (value && !TimePoint.isTimePoint(value)) {
            throw illegalArgumentError('TimePeriod.end: Value must be null or a TimePoint');
        }

        this[PRIVATE].end = value || null;
    }

    /**
     * Set the TimePeriod `begin` to the given `time` in milliseconds since UNIX epoch. Counters are not set.
     * @param {Number} time
     */
    beginAtTime(time) {
        this.begin = new TimePoint(time, {});
    }

    /**
     * Set the TimePeriod `end` to the given `time` in milliseconds since UNIX epoch. Counters are not set.
     * @param {Number} time
     */
    endAtTime(time) {
        this.end = new TimePoint(time, {});
    }

    /**
     * The duration in milliseconds that this TimePeriod represents.
     *
     * @return {number} Milliseconds (with a fractional part)
     */
    get duration() {
        if (!this.isComplete) {
            return NaN;
        }

        return this.end.diff(this.begin);
    }

    /**
     * Clear this TimePeriod. There is no longer a begin or end TimePoint.
     */
    clear() {
        this.begin = null;
        this.end = null;
    }

    /**
     * Begin the TimePeriod. The "begin" is set to the current time.
     *
     * @throws {Error} If this method is called in an invalid state (for example if this TimePeriod has already been completed)
     */
    beginNow() {
        if (!this.isCleared) {
            throw illegalStateError('TimePeriod.beginNow: This TimePeriod can only begin if it is currently "cleared"');
        }

        this.begin = new TimePoint();
    }

    /**
     * End the TimePeriod. The "end" is set to the current time.
     *
     * @throws {Error} If this method is called in an invalid state (for example if this TimePeriod has already been completed)
     */
    endNow() {
        if (!this.isPending) {
            throw illegalStateError('TimePeriod.endNow: This TimePeriod can only end if it is currently "pending"');
        }

        this.end = new TimePoint();
    }

    /**
     * Is the period cleared?. In this case there are no begin or end TimePoint.
     *
     * A TimePeriod transitions from "cleared" -> "pending" -> "ended".
     *
     * @return {boolean}
     */
    get isCleared() {
        return this.begin === null && this.end === null;
    }

    /**
     * Is the period pending?. In this case there is only a begin TimePoint.
     *
     * A TimePeriod transitions from "cleared" -> "pending" -> "ended".
     *
     * @return {boolean}
     */
    get isPending() {
        return this.begin !== null && this.end === null;
    }

    /**
     * Is the period complete?. In this case there is both a begin TimePoint and end TimePoint.
     *
     * A duration can now be determined.
     *
     * A TimePeriod transitions from "cleared" -> "pending" -> "ended".
     *
     * @type {boolean}
     */
    get isComplete() {
        return this.begin !== null && this.end !== null;
    }
}

Object.freeze(TimePeriod);
Object.freeze(TimePeriod.prototype);

module.exports = TimePeriod;
