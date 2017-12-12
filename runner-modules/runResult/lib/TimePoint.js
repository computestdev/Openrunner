'use strict';

let getCurrentCounters;

/**
 * Represents a point in time in milliseconds.
 *
 * This class consists of a wall clock time (required) and one or more accurate timestamp counters.
 * (Timestamp counters should only be used for relative comparisons).
 */
class TimePoint {
    static setCounterFunc(fn) {
        if (getCurrentCounters) {
            throw Error('Already set');
        }
        getCurrentCounters = fn;
    }

    /**
     * Does the given value look like a TimePoint?.
     *
     * @param {*} object
     * @return {boolean}
     */
    static isTimePoint(object) {
        return Boolean(
            object &&
            typeof object.time === 'number' &&
            typeof object.toJSONObject === 'function'
        );
    }

    /**
     * Compare two time points.
     *
     * if a == b             , 0 will returned
     * if a  < b or a is null, a number less than 0 will be returned
     * if a  > b or b is null, a number greater than 0 will be returned
     *
     * This function signature is compatible with Array.prototype.sort
     *
     * @param {?TimePoint} a
     * @param {?TimePoint} b
     * @return {number}
     */
    static compare(a, b) {
        if (a === null && b === null) {
            return 0;
        }

        if (a === null) {
            return -1;
        }

        if (b === null) {
            return 1;
        }

        const timeCompare = a.time - b.time;
        if (timeCompare) {
            return timeCompare;
        }

        if (a.contentCounter !== undefined && b.contentCounter !== undefined) {
            return a.contentCounter - b.contentCounter;
        }

        if (a.scriptCounter !== undefined && b.scriptCounter !== undefined) {
            return a.scriptCounter - b.scriptCounter;
        }

        if (a.backgroundCounter !== undefined && b.backgroundCounter !== undefined) {
            return a.backgroundCounter - b.backgroundCounter;
        }

        return 0;
    }

    /**
     * @param {number} [timeArg=Date.now()] The current time in milliseconds since UNIX epoch
     * @param {object} [countersArg=now()] An object of performance counters.
     *        All values are in milliseconds (with an undefined starting point)
     */
    constructor(timeArg, countersArg) {
        const useDefaults = timeArg === undefined && countersArg === undefined;
        const time = useDefaults ? Date.now() : timeArg;
        const counters = useDefaults ? getCurrentCounters() : countersArg || {};

        if (typeof time !== 'number') {
            throw Error('Invalid argument: `time` must be a number');
        }

        if (typeof counters !== 'object') {
            throw Error('Invalid argument: `counters` must be an object');
        }

        if (counters.contentCounter !== undefined && typeof counters.contentCounter !== 'number') {
            throw Error('Invalid argument: `counters.contentCounter` must be undefined or a number');
        }

        if (counters.scriptCounter !== undefined && typeof counters.scriptCounter !== 'number') {
            throw Error('Invalid argument: `counters.scriptCounter` must be undefined or a number');
        }

        if (counters.backgroundCounter !== undefined && typeof counters.backgroundCounter !== 'number') {
            throw Error('Invalid argument: `counters.backgroundCounter` must be undefined or a number');
        }

        /**
         * The current time in milliseconds since UNIX epoch
         *
         * @type {number}
         */
        this.time = time;

        /**
         * A performance counter from the content process with an undefined starting point
         *
         * @type {?number}
         */
        this.contentCounter = counters.contentCounter;

        /**
         * A performance counter from the runner script thread with an undefined starting point
         *
         * @type {?number}
         */
        this.scriptCounter = counters.scriptCounter;

        /**
         * A performance counter from the parent process with an undefined starting point
         *
         * @type {?number}
         */
        this.backgroundCounter = counters.backgroundCounter;

        Object.freeze(this);
    }

    /**
     * @return {{contentCounter: ?number, scriptCounter: ?number, backgroundCounter: ?number, time: number}}
     */
    toJSONObject() {
        return {
            contentCounter: this.contentCounter,
            scriptCounter: this.scriptCounter,
            backgroundCounter: this.backgroundCounter,
            time: this.time,
        };
    }

    /**
     * @param {Number} duration
     * @return {TimePoint}
     */
    add(duration) {
        return new TimePoint(
            this.time + duration,
            {
                backgroundCounter: typeof this.backgroundCounter === 'number'
                    ? this.backgroundCounter + duration
                    : this.backgroundCounter,
                scriptCounter: typeof this.scriptCounter === 'number'
                    ? this.scriptCounter + duration
                    : this.scriptCounter,
                contentCounter: typeof this.contentCounter === 'number'
                    ? this.contentCounter + duration
                    : this.contentCounter,
            });
    }

    /**
     * The difference in milliseconds between `this` TimePoint and `other` (this - other)
     * @param {?TimePoint} other
     * @return {number}
     */
    diff(other) {
        if (!other) {
            return NaN;
        }

        if (typeof this.contentCounter === 'number' && typeof other.contentCounter === 'number') {
            return this.contentCounter - other.contentCounter;
        }

        if (typeof this.scriptCounter === 'number' && typeof other.scriptCounter === 'number') {
            return this.scriptCounter - other.scriptCounter;
        }

        if (typeof this.backgroundCounter === 'number' && typeof other.backgroundCounter === 'number') {
            return this.backgroundCounter - other.backgroundCounter;
        }

        // `time` is always available, however it is less precise
        return this.time - other.time;
    }
}

Object.freeze(TimePoint);
Object.freeze(TimePoint.prototype);

module.exports = TimePoint;
