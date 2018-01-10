'use strict';
const NOOP = () => {};

class WaitForEvent {
    constructor() {
        this._pendingWaits = new Map();
        Object.freeze(this);
    }

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

    resolve(key, value) {
        return this._fulfill(false, key, value);
    }

    reject(key, error) {
        return this._fulfill(true, key, error);
    }
}

module.exports = WaitForEvent;
