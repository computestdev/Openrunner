'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq}} = require('chai');

const applyHeaderModificationMap = require('../../lib/applyHeaderModificationMap');

describe('applyHeaderModificationMap', () => {
    it('Should properly add/modify/remove headers based on the passed Map', () => {
        // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/HttpHeaders
        const oldHeaders = Object.freeze([
            Object.freeze({
                name: 'User-Agent',
                value: 'Vuurvosje',
            }),
            Object.freeze({
                name: 'Origin',
                value: 'http://somewhere-but-not-here',
            }),
            Object.freeze({
                name: 'Pragma',
                value: 'no-cache',
            }),
        ]);

        const modificationMap = new Map([
            [
                'user-agent',
                {
                    name: 'User-Agent',
                    value: 'Frooglebot',
                },
            ],
            [
                'pragma',
                {
                    name: 'Pragma',
                    value: null,
                },
            ],
        ]);

        const newHeaders = applyHeaderModificationMap(oldHeaders, modificationMap);
        deq(newHeaders, [
            {
                name: 'Origin',
                value: 'http://somewhere-but-not-here',
            },
            {
                name: 'User-Agent',
                value: 'Frooglebot',
            },
        ]);
    });
});
