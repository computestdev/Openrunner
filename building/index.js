'use strict';

const buildFirefoxProfileFunctions = require('./buildFirefoxProfile');
const buildSources = require('./buildSources');

module.exports = Object.assign(
    {
        buildSources,
    },
    buildFirefoxProfileFunctions,
);
