'use strict';
const parseTimeoutArgument = require('../../../../lib/parseTimeoutArgument');
const delayPromise = require('../../../../lib/delay');

openRunnerRegisterRunnerModule('wait', async ({script}) => {
    const delay = async timeout => {
        const ms = parseTimeoutArgument(timeout);
        await delayPromise(ms);
    };
    return {delay};
});
