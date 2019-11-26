'use strict';
const {setHandler} = require('../../../../lib/logger');

const setupLogging = (browserRuntime, contentToken) => {
    const logHandler = obj => {
        browserRuntime.sendMessage('openrunner@computest.nl', {logMessage: obj, contentToken}, {});
    };
    setHandler(logHandler);
    return logHandler;
};

module.exports = {setupLogging};
