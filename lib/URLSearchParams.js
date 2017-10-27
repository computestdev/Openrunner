'use strict';
// 'ur' + 'l' is a trick so that browserify ignores it
module.exports = global.URLSearchParams || require('ur' + 'l').URLSearchParams; // eslint-disable-line global-require
