'use strict';
const {logRaw} = require('../../../../lib/logger');

const handleRuntimeMessage = (message, messageSender) => {
    const {id, tab, frameId: browserFrameId} = messageSender;

    if (
        id !== 'openrunner@computest.nl' ||
        !message ||
        typeof message.logMessage !== 'object' ||
        !message.logMessage
    ) {
        return;
    }

    logRaw(Object.assign({}, message.logMessage, {
        fromContent: {
            browserTabId: tab && tab.id,
            browserFrameId,
            contentToken: message.contentToken,
        },
    }));
};

const setupLogging = (browserRuntime) => {
    browserRuntime.onMessage.addListener(handleRuntimeMessage);
};

module.exports = {setupLogging};
