'use strict';
const URL = require('./URL');
const maxTextLengthWithEllipsis = require('./maxTextLengthWithEllipsis');

const SHORT_TITLE_MAX_LENGTH = 64;

const urlForShortTitle = urlString => {
    const url = new URL(urlString);

    // '' => '/'
    // '/' => '/'
    // '/foo' => 'foo'
    // '/foo.html' => 'foo.html'
    // '/foo/bar.html' => 'bar.html'
    const path = url.pathname.replace(/\/+$/, '').replace(/^.*\//, '') || '/';
    const shortTitle = path + url.search;
    return maxTextLengthWithEllipsis(shortTitle, SHORT_TITLE_MAX_LENGTH);
};

module.exports = urlForShortTitle;
