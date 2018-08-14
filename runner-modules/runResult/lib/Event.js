'use strict';

const {illegalArgumentError} = require('../../../lib/scriptErrors');
const deepFreeze = require('../../../lib/deepFreeze');
const TimePoint = require('./TimePoint');
const TimePeriod = require('./TimePeriod');

const PRIVATE = Symbol();

function jsonClone(value) {
    // This ensures that everything is cloned, but also that the value can be properly converted to json when compiling the
    // complete run result
    const valueJson = JSON.stringify(value);
    return valueJson === undefined ? null : JSON.parse(valueJson);
}

/**
 * An event is a time period which describes an event that occurred within the browser itself or the document.
 *
 * Each event has a "type" name, multiple events may have the same type name. The type name should describe what the event was.
 * And event may contain child events. For example a "http-request" event might contain "dns", "wait", "transfer" child events.
 *
 * Events without a begin should, in principal, not occur. However events without an end are valid (which means that the event ends
 * _after_ the script run)
 */
class Event {
    /**
     * Does the given value look like an Event?
     *
     * @param {*} object
     * @return {boolean}
     */
    static isEvent(object) {
        return Boolean(
            object &&
            typeof object.type === 'string' &&
            TimePeriod.isTimePeriod(object.timing) &&
            typeof object.toJSONObject === 'function' &&
            typeof object.addChild === 'function' &&
            typeof object.setMetaData === 'function'
        );
    }

    /**
     * @param {!String} type
     * @param {!TimePoint} beginTimePoint
     * @param {?TimePoint} [endTimePoint=null]
     * @return {Event}
     */
    static fromTimePoint(type, beginTimePoint, endTimePoint = null) {
        const event = new Event(type);
        event.timing.begin = beginTimePoint;
        event.timing.end = endTimePoint;
        return event;
    }

    /**
     * @param {!String} type
     * @param {!number} beginTime Unix time in Milliseconds, see Date.now()
     * @param {?number} [endTime=null] Unix time in Milliseconds, see Date.now()
     * @return {Event}
     */
    static fromTime(type, beginTime, endTime = null) {
        const event = new Event(type);

        if (typeof beginTime !== 'number') {
            throw illegalArgumentError('Event.fromTime: Second argument (beginTime) is mandatory and must be a number');
        }

        event.timing.begin = new TimePoint(beginTime, {});

        if (endTime !== null) {
            if (typeof endTime !== 'number') {
                throw illegalArgumentError('Event.fromTime: Third argument (endTime) must be a number or null');
            }

            event.timing.end = new TimePoint(endTime, {});
        }

        return event;
    }

    /**
     * @param {string} type The type name of this Event. Multiple events can have the same type name.
     */
    constructor(type) {
        this[PRIVATE] = Object.seal({
            children: new Set(),
            comment: '',
            longTitle: '',
            metaData: new Map(),
            shortTitle: '',
            timing: new TimePeriod(),
            type: String(type),
            tabId: null,
            frameId: null,
            tabContentId: null,
        });
        Object.freeze(this);
    }

    /**
     * The type name of this Event. Multiple events can have the same type name.
     *
     * @return {string}
     */
    get type() {
        return this[PRIVATE].type;
    }

    /**
     * The time period that this event represents. This value is never null, however the TimePeriod itself might have null
     * begin/end TimePoint's. For example, if an event is still on going, the "begin" is set, but the "end" will be null.
     *
     * @return {TimePeriod}
     */
    get timing() {
        return this[PRIVATE].timing;
    }

    /**
     * @param {TimePeriod} value
     */
    set timing(value) {
        if (!TimePeriod.isTimePeriod(value)) {
            throw illegalArgumentError('Event.timing: Value must be a TimePeriod');
        }

        this[PRIVATE].timing = value;
    }

    /**
     * @param {Event} event
     * @return {Event} The same value as `event`
     */
    addChild(event) {
        if (!Event.isEvent(event)) {
            throw illegalArgumentError('Event.addChild: First argument must be an Event object');
        }

        this[PRIVATE].children.add(event);
        return event;
    }

    /**
     * Create an event and add it as a child
     * @param {!String} type
     * @param {!TimePoint} beginTimePoint
     * @param {?TimePoint} [endTimePoint=null]
     * @return {Event}
     */
    childTimePointEvent(type, beginTimePoint, endTimePoint = null) {
        const event = Event.fromTimePoint(type, beginTimePoint, endTimePoint);
        return this.addChild(event);
    }

    /**
     * Create an event and add it as a child
     * @param {!String} type
     * @param {!number} beginTime Unix time in Milliseconds, see Date.now()
     * @param {?number} [endTime=null] Unix time in Milliseconds, see Date.now()
     * @return {Event}
     */
    childTimeEvent(type, beginTime, endTime = null) {
        const event = Event.fromTime(type, beginTime, endTime);
        return this.addChild(event);
    }

    /**
     * @return {Iterator.<Event>}
     */
    get children() {
        return this[PRIVATE].children.values();
    }

    /**
     * The "comment" field may be provided by a script creator to provide extra human readable information
     *
     * @return {string}
     */
    get comment() {
        return this[PRIVATE].comment;
    }

    /**
     * The "comment" field may be provided by a script creator to provide extra human readable information
     *
     * @param {string} value
     */
    set comment(value) {
        this[PRIVATE].comment = String(value);
    }

    /**
     * The "shortTitle" field is an automatically generated human readable title to be displayed in GUI's. Its content may be clipped in
     * such GUI's so it should be short as possible.
     *
     * @return {string}
     */
    get shortTitle() {
        return this[PRIVATE].shortTitle;
    }

    /**
     * The "shortTitle" field is an automatically generated human readable title to be displayed in GUI's. Its content may be clipped in
     * such GUI's so it should be short as possible.
     *
     * @param {string} value
     */
    set shortTitle(value) {
        this[PRIVATE].shortTitle = String(value);
    }

    /**
     * The "longTitle" field is an automatically generated human readable title to be displayed in GUI's. Its content should not be clipped
     * in such GUI's and may be of any length.
     *
     * @return {string}
     */
    get longTitle() {
        return this[PRIVATE].longTitle;
    }

    /**
     * The "longTitle" field is an automatically generated human readable title to be displayed in GUI's. Its content should not be clipped
     * in such GUI's and may be of any length.
     *
     * @param {string} value
     */
    set longTitle(value) {
        this[PRIVATE].longTitle = String(value);
    }

    /**
     * Return all metadata entries that have been set
     * @return {Iterator.<[String, *]>}
     */
    get metaData() {
        return this[PRIVATE].metaData.entries();
    }

    /**
     * Get the metadata value for the given key
     * @param {String} key
     * @return {*}
     */
    getMetaData(key) {
        if (typeof key !== 'string') {
            throw illegalArgumentError('Event.getMetaData: First argument (key) must be a string');
        }

        return this[PRIVATE].metaData.has(key)
            ? this[PRIVATE].metaData.get(key)
            : null;
    }

    /**
     * Get the metadata value for the given key
     * @param {String} key
     * @param {*} value Any value that is convertible to json
     */
    setMetaData(key, value) {
        if (typeof key !== 'string') {
            throw illegalArgumentError('Event.setMetaData: First argument (key) must be a string');
        }

        // jsonClone() ensures that everything is cloned, but also that the stored value can be properly converted to json when
        // compiling the complete run result (fail early)
        const valueCopy = jsonClone(value);
        deepFreeze(valueCopy); // freeze so that the return value of getMetaData() can not be modified
        this[PRIVATE].metaData.set(key, valueCopy);
    }

    /**
     *
     * @return {?string}
     */
    get tabId() {
        return this[PRIVATE].tabId;
    }

    /**
     *
     * @param {?string} value
     */
    set tabId(value) {
        this[PRIVATE].tabId = value ? String(value) : null;
    }

    /**
     *
     * @return {?number}
     */
    get frameId() {
        return this[PRIVATE].frameId;
    }

    /**
     *
     * @param {?number} value
     */
    set frameId(value) {
        this[PRIVATE].frameId = value ? Number(value) : null;
    }

    /**
     *
     * @return {?string}
     */
    get tabContentId() {
        return this[PRIVATE].tabContentId;
    }

    /**
     *
     * @param {?string} value
     */
    set tabContentId(value) {
        this[PRIVATE].tabContentId = value ? String(value) : null;
    }

    /**
     * @return {{
     *   children: Array,
     *   timing: ({
     *       begin: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *       end: (?{contentCounter: ?number, parentCounter: ?number, time: number}),
     *       duration: number
     *   }),
     *   type: string
     * }}
     */
    toJSONObject() {
        const metaData = {};

        for (const [key, value] of this.metaData) {
            // the result of toJSONObject should not be "live", nor expose any "frozen" objects
            metaData[key] = jsonClone(value);
        }

        // Firefox appears to maintain key order, so put the keys in an order that makes it more convenient to read the resulting json
        /* eslint-disable sort-keys */
        const result = {
            type: this.type,
            shortTitle: this.shortTitle,
            longTitle: this.longTitle,
            comment: this.comment,
            id: null, // Set by parent-process/RunResult
            timing: this.timing.toJSONObject(),
            metaData: metaData,
            children: [...this.children].map(event => event.toJSONObject()),
            tabId: this.tabId,
            frameId: this.frameId,
            tabContentId: this.tabContentId,
        };
        /* eslint-enable sort-keys */

        result.children.sort((a, b) => TimePoint.compare(a.timing.begin, b.timing.begin));

        return result;
    }
}

Object.freeze(Event);
Object.freeze(Event.prototype);

module.exports = Event;
