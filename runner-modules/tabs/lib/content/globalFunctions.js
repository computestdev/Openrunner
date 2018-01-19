'use strict';

module.exports = async (getModule) => {
    const transaction = async (...args) => {
        const runResult = await getModule('runResult');
        return runResult.scriptResult.transaction(...args);
    };

    return {transaction};
};
