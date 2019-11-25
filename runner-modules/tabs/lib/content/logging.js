'use strict';
const {setHandler} = require('../../../../lib/logger');

const setupLogging = (browserRuntime) => {
    const logHandler = obj => {
        browserRuntime.sendMessage('openrunner@computest.nl', {logMessage: obj}, {});
    };
    setHandler(logHandler);
    return logHandler;
};

module.exports = {setupLogging};
