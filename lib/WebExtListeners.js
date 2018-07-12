'use strict';
const log = require('./logger')({MODULE: 'WebExtListeners'});

class WebExtListeners {
    constructor(api, thisObject = null) {
        this._api = api;
        this._thisObject = thisObject;
        this._cleanup = [];
        Object.freeze(this);
    }

    add(event, callback, ...args) {
        const emitter = this._api[event];
        const thisObject = this._thisObject;
        const listenerCallback = (...args) => callback.apply(thisObject, args);
        emitter.addListener(listenerCallback, ...args);
        this._cleanup.push(() => emitter.removeListener(listenerCallback));
    }

    cleanup() {
        for (const func of this._cleanup) {
            try {
                func();
            }
            catch (err) {
                log.error({err}, 'Error removing listener');
            }
        }
        this._cleanup.length = 0;
    }
}

module.exports = WebExtListeners;
