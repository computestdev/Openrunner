'use strict';
const {logRaw, setHandler} = require('../../../lib/logger');

const setupLogging = (browserRuntime) => {
    setHandler(obj => {
        browserRuntime.sendMessage('openrunner@computest.nl', {logMessage: obj}, {});
    });
};

const maybeParseWorkerLogMessage = message => {
    if (message && message.logMessage && typeof message.logMessage === 'object') {
        logRaw(Object.assign({}, message.logMessage, {
            fromScriptEnv: true,
        }));
        return true;
    }

    return false;
};

module.exports = {setupLogging, maybeParseWorkerLogMessage};
