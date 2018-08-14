'use strict';
const DeepStore = require('deep-store');

const NOOP = () => {};

class WaitForEvent {
    constructor() {
        this._pendingWaits = new DeepStore();
        Object.freeze(this);
    }

    /**
     * @param {Array} key
     * @param {Function} func
     */
    async wait(key, func = NOOP) {
        {
            const waitData = this._pendingWaits.get(key);
            if (waitData) {
                return waitData.promise;
            }
        }

        const waitData = {};
        waitData.promise = new Promise((resolve, reject) => {
            waitData.resolve = resolve;
            waitData.reject = reject;
        });
        Object.freeze(waitData);
        this._pendingWaits.set(key, waitData);

        await func();
        return await waitData.promise;
    }

    _fulfill(reject, key, value) {
        const waitData = this._pendingWaits.get(key);
        if (!waitData) {
            return false;
        }

        this._pendingWaits.delete(key);
        if (reject) {
            waitData.reject(value);
        }
        else {
            waitData.resolve(value);
        }
        return true;
    }

    /**
     * @param {Array} key
     * @param {*} value
     * @return {Boolean}
     */
    resolve(key, value = undefined) {
        return this._fulfill(false, key, value);
    }

    /**
     * @param {Array} key
     * @param {Error} error
     * @return {Boolean}
     */
    reject(key, error) {
        return this._fulfill(true, key, error);
    }
}

module.exports = WaitForEvent;
