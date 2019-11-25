'use strict';
const {setHandler, defaultHandler} = require('../../../lib/logger');

const setupLogging = (cncClient) => {
    let pending = 0;
    let warnedAboutDroppedMessage = false;

    async function sendLogMessage(obj) {
        try {
            ++pending;
            await cncClient.call('logMessage', obj);
        }
        finally {
            --pending;
        }
    }

    setHandler(obj => {
        defaultHandler(obj);

        if (pending < 100) {
            // reset warning
            warnedAboutDroppedMessage = false;
        }

        if (pending >= 1000) {
            if (!warnedAboutDroppedMessage) {
                warnedAboutDroppedMessage = true;
                // eslint-disable-next-line no-console
                console.error('Dropping one or more log messages from being sent to the C&C Client. Too many log messages are pending!');
            }
        }
        else { // pending < 1000
            sendLogMessage(obj); // promise ignored on purpose
        }
    });
};

module.exports = {setupLogging};
