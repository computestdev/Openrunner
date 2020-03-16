'use strict';

/** @template T
 * @typedef {{ resolve: (value: T) => void; reject: (error: Error) => void; promise: Promise<T> }} ExplicitPromise
 */

/**
 * @template T
 * @return {ExplicitPromise<T>}
 */
const explicitPromise = () => {
    /** @type {any} */
    let resolve;
    /** @type {any} */
    let reject;
    const promise = new Promise((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });
    return {promise, resolve, reject};
};

module.exports = explicitPromise;
