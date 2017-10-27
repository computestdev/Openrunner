'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {isAbove, isBelow}} = require('chai');

const delay = require('../../lib/delay');

describe('delay', () => {
    it('Should resolve the returned promise after the given amount of milliseconds', {slow: 220}, async () => {
        const before = Date.now();
        await delay(100);
        const after = Date.now();
        isAbove(after - before, 90);
        isBelow(after - before, 900);
    });
});
