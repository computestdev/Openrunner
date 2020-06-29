'use strict';

const buildFirefoxProfileFunctions = require('./buildFirefoxProfile');
const buildSources = require('./buildSources');
const copyFirefoxFunctions = require('./copyFirefox');

module.exports = Object.assign(
    {
        buildSources,
    },
    buildFirefoxProfileFunctions,
    copyFirefoxFunctions,
);
