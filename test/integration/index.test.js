'use strict';
const {before, after} = require('mocha-sugar-free');

const {start, stop} = require('../utilities/integrationTest');

before({timeout: 60000}, () => start());
after({timeout: 10000}, () => stop());
