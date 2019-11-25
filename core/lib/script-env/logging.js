'use strict';
const {setHandler} = require('../../../lib/logger');

const setupLogging = (workerPort) => {
    setHandler(obj => {
        workerPort.postMessage({logMessage: obj});
    });
};

module.exports = {setupLogging};
