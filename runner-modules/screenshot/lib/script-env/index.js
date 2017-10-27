'use strict';

openRunnerRegisterRunnerModule('screenshot', async ({script}) => {
    const take = async comment => {
        await script.rpcCall('screenshot.take', {comment});
    };

    return {take};
});
