'use strict';

openRunnerRegisterRunnerModule('requestBlocking', async ({script}) => {
    const block = async (patternsArg, body) => {
        const patterns = Array.isArray(patternsArg) ? patternsArg : patternsArg;
        const id = await script.rpcCall('requestBlocking.addPattern', {patterns});

        if (!body) {
            return undefined; // permanent change (that is, for the duration of the scrip)
        }

        try {
            return await body();
        }
        finally {
            await script.rpcCall('requestBlocking.removePattern', {id});
        }
    };

    return Object.freeze({
        block,
    });
});
