'use strict';
const {before, after} = require('mocha-sugar-free');

const integrationTest = require('../utilities/integrationTest');

before({timeout: 60000}, () => integrationTest.start());
after({timeout: 10000}, () => integrationTest.stop());

module.exports = integrationTest;
