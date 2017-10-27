'use strict';

function deepFreeze(obj) {
    if (!obj) {
        return obj;
    }

    for (const name of Object.getOwnPropertyNames(obj)) {
        const value = obj[name];

        if (value !== null && typeof value === 'object') {
            deepFreeze(value);
        }
    }

    return Object.freeze(obj);
}

module.exports = deepFreeze;
