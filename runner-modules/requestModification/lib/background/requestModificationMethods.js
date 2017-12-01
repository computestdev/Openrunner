'use strict';
const {assert} = require('chai');

const requestModificationMethods = ({requestHeaderPatterns, responseHeaderPatterns}) => {
    const addPattern = ({patterns, headers, type}) => {
        assert(Array.isArray(patterns));
        assert(Array.isArray(headers));
        patterns.forEach(pattern => assert.isString(pattern));
        headers.forEach(entry => {
            assert(Array.isArray(entry));
            assert.isString(entry[0]);
            assert(entry[1] === null || typeof entry[1] === 'string');

            const [name, value] = entry;
            entry[0] = name.toLowerCase();
            entry[1] = {name, value};
        });

        const modificationMap = new Map(headers);
        if (type === 'request') {
            return requestHeaderPatterns.add(patterns, modificationMap);
        }
        if (type === 'response') {
            return responseHeaderPatterns.add(patterns, modificationMap);
        }
        throw Error(`Invalid type: ${type}`);
    };

    const removePattern = ({id}) => {
        const requestRemoved = requestHeaderPatterns.remove(id);
        const responseRemoved = responseHeaderPatterns.remove(id);
        return requestRemoved || responseRemoved;
    };

    return new Map([
        ['requestModification.addPattern', addPattern],
        ['requestModification.removePattern', removePattern],
    ]);
};

module.exports = requestModificationMethods;
