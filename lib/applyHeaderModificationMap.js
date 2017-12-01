'use strict';

/**
 *
 * @param {Array.<{name: String, value: String, binaryValue: number[]}>} oldHeaders
 *        https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/HttpHeaders
 * @param {Map.<string, {name: String, value: String}>} modificationMap The key of this map must the be lower case header name!
 * @return {Array.<{name: String, value: String, binaryValue: number[]}>}
 */
const applyHeaderModificationMap = (oldHeaders, modificationMap) => {
    /*
    modificationMap = new Map([
        ['User-Agent', 'FoogleBlot'],
        ['Cache-Control', 'no-store, no-cache'],
        ['Cookie', null], // remove the Cookie header
    ]);
    */

    // caveat of this implementation: when replacing headers the order will change, this is observable by the HTTP server.
    // however a proper http server should not act upon this difference
    const headers = oldHeaders.filter(header => !modificationMap.has(header.name.toLowerCase()));

    for (const [, {name, value}] of modificationMap.entries()) {
        if (value !== null) {
            headers.push({name, value});
        }
    }

    return headers;
};

module.exports = applyHeaderModificationMap;
