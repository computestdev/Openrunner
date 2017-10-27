'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq}} = require('chai');

const maxTextLengthWithEllipsis = require('../../lib/maxTextLengthWithEllipsis');

describe('maxTextLengthWithEllipsis', () => {
    it('Should not modify strings that fit within the length limit', () => {
        eq(maxTextLengthWithEllipsis('abcdefghijklm', 14), 'abcdefghijklm');
        eq(maxTextLengthWithEllipsis('abcdefghijklm', 13), 'abcdefghijklm');
    });

    it('Should strim strings that are too long and add an unicode ellipsis', () => {
        eq(maxTextLengthWithEllipsis('abcdefghijklm', 12), 'abcdefghijk\u2026');
        eq(maxTextLengthWithEllipsis('abcdefghijklm', 11), 'abcdefghij\u2026');
    });
});
