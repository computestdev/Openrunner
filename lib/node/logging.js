'use strict';
const {logRaw} = require('../logger');

const handleExtensionLogMessage = logMessage => {
    logRaw(Object.assign({}, logMessage, {
        fromExtension: true,
    }));
};

module.exports = {handleExtensionLogMessage};
