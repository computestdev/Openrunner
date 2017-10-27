'use strict';

/* eslint global-require:off */

module.exports = new Map([
    ['assert', require('./assert/lib/background')],
    ['chai', require('./chai/lib/background')],
    ['expect', require('./expect/lib/background')],
    ['runResult', require('./runResult/lib/background')],
    ['tabs', require('./tabs/lib/background')],
]);
