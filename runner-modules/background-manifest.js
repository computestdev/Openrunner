'use strict';

/* eslint global-require:off */

module.exports = new Map([
    ['runResult', require('./runResult/lib/background')],
    ['tabs', require('./tabs/lib/background')],
]);
