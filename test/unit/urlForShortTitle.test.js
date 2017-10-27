'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq}} = require('chai');

const urlForShortTitle = require('../../lib/urlForShortTitle');

describe('urlForShortTitle', () => {
    it('Should convert the passed URL to a very short representation, for use in a GUI', () => {
        eq(urlForShortTitle('http://example.com'), '/');
        eq(urlForShortTitle('http://example.com/'), '/');
        eq(urlForShortTitle('http://example.com/foo'), 'foo');
        eq(urlForShortTitle('http://example.com/foo/'), 'foo');
        eq(urlForShortTitle('http://example.com/foo/bar/baz.html'), 'baz.html');
        eq(urlForShortTitle('http://example.com/foo/bar/baz.html?foo=123'), 'baz.html?foo=123');
        eq(urlForShortTitle('http://example.com/foo/bar/baz.html?foo=123&bar=456'), 'baz.html?foo=123&bar=456');
        eq(urlForShortTitle('http://example.com/foo/bar/baz.html?foo=123&bar=456#quux'), 'baz.html?foo=123&bar=456');
        eq(
            urlForShortTitle('http://example.com/foo/bar/baz.html?foo=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz'),
            'baz.html?foo=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwx\u2026',
        );
    });
});
