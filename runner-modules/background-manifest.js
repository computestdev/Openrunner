'use strict';

/* eslint global-require:off */

module.exports = new Map([
    ['assert', require('./assert/lib/background')],
    ['chai', require('./chai/lib/background')],
    ['expect', require('./expect/lib/background')],
    ['httpEvents', require('./httpEvents/lib/background')],
    ['requestBlocking', require('./requestBlocking/lib/background')],
    ['runResult', require('./runResult/lib/background')],
    ['screenshot', require('./screenshot/lib/background')],
    ['tabs', require('./tabs/lib/background')],
    ['wait', require('./wait/lib/background')],
]);
