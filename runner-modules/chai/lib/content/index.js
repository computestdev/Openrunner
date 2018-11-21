'use strict';
const chai = require('../chai');
const registerRunnerModule = require('../../../content-register');

registerRunnerModule('chai', () => {
    return chai();
});
