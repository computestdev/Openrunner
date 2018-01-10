'use strict';
const extendStack = require('../../../../lib/extendStack');

openRunnerRegisterRunnerModule('screenshot', async ({script}) => {
    const take = async comment => extendStack(async () => {
        await script.rpcCall('screenshot.take', {comment});
    });

    return {take};
});
