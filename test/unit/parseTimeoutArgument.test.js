'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {throws, strictEqual: eq}} = require('chai');

const parseTimeoutArgument = require('../../lib/parseTimeoutArgument');

describe('parseTimeoutArgument', () => {
    it('Should return numbers as-is (aka milliseconds)', () => {
        eq(parseTimeoutArgument(1234), 1234);
        eq(parseTimeoutArgument('10s'), 10000);
        eq(parseTimeoutArgument('32.234545s'), 32234.545);
    });

    it('Should convert a string to milliseconds based on its suffix', () => {
        eq(parseTimeoutArgument('10s'), 10000);
        eq(parseTimeoutArgument('32.234545s'), 32234.545);
    });

    it('Should throw for invalid arguments', () => {
        throws(() => parseTimeoutArgument({}), /invalid.*timeout/i);
        throws(() => parseTimeoutArgument(() => {}), /invalid.*timeout/i);
        throws(() => parseTimeoutArgument(), /invalid.*timeout/i);
    });
});
