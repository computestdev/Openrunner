'use strict';
const {setHandler, defaultHandler} = require('../../../lib/logger');

const setupLogging = (cncClient) => {
    setHandler(obj => {
        defaultHandler(obj);
        cncClient.notify('logMessage', obj);
    });
};

module.exports = {setupLogging};
