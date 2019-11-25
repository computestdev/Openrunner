'use strict';
const {setHandler} = require('../../../../lib/logger');

const setupLogging = (browserRuntime) => {
    setHandler(obj => {
        browserRuntime.sendMessage('openrunner@computest.nl', {logMessage: obj}, {});
    });
};

module.exports = {setupLogging};
