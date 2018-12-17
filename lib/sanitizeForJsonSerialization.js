'use strict';

const isSimpleObject = obj => {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    const proto = Object.getPrototypeOf(obj);
    if (proto === null) { // obj = Object.create(null)
        return true;
    }

    return Object.getPrototypeOf(proto) === null; // obj = {}
};

/**
 * Sanitize the argument/return value of content script snippets (tab.run(), etc) so that it
 * is JSON serializable. Without this, the scripts would timeout if for example a DOM node is
 * returned, because browser.runtime.sendMessage() fails to clone the value.
 * A very common way to script is:
 *   tabs.run(async () => wait.selector('foo'))
 * which would return the DOM Element, so this is something we want to support.
 * @param {*} value
 * @param {*} [replacementValue=null] The value to replace invalid values with
 * @return {*}
 */
const sanitizeForJsonSerialization = (value, replacementValue = null) => {
    if (!value) {
        return value;
    }

    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitizeForJsonSerialization(item, replacementValue));
    }

    if (isSimpleObject(value)) {
        const result = {};
        for (const key in value) {
            if (typeof key === 'string') {
                result[key] = sanitizeForJsonSerialization(value[key], replacementValue);
            }
        }
        return result;
    }

    return replacementValue;
};

module.exports = sanitizeForJsonSerialization;
