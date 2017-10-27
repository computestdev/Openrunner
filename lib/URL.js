'use strict';
// 'ur' + 'l' is a trick so that browserify ignores it
module.exports = global.URL || require('ur' + 'l').URL; // eslint-disable-line global-require
