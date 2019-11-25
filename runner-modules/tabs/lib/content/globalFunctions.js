'use strict';
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/globalFunctions'});

module.exports = async (getModule) => {
    const transaction = async (...args) => {
        const runResult = await getModule('runResult');
        return runResult.scriptResult.transaction(...args);
    };

    const logFunc = (...messages) => {
        // eslint-disable-next-line no-console
        console.log('RunnerContentScript:', ...messages);
        const message = messages.join(' ');
        log.info({fromRunnerContentScript: true}, message);
    };

    return {transaction, log: logFunc};
};
