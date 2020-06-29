'use strict';

const {
    buildFirefoxExtension,
    buildFirefoxProfile,
    buildTempFirefoxProfile,
    buildTempFirefoxExtensionDirectory,
    buildFirefoxPolicies,
    copyFirefox,
    copyFirefoxToTemp,
} = require('./building');
const CnCServer = require('./lib/node/CnCServer');
const OpenrunnerClient = require('./lib/node/OpenrunnerClient');
const getRunnerScriptMetadata = require('./lib/getRunnerScriptMetadata');

module.exports = {
    buildFirefoxExtension,
    buildFirefoxProfile,
    buildTempFirefoxProfile,
    buildFirefoxPolicies,
    copyFirefox,
    copyFirefoxToTemp,
    CnCServer,
    buildTempFirefoxExtensionDirectory,
    OpenrunnerClient,
    getRunnerScriptMetadata,
};
