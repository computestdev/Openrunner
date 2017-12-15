'use strict';

const parsePatternArg = patternsArg => {
    const patterns = Array.isArray(patternsArg)
        ? patternsArg
        : [patternsArg];

    for (const value of patterns) {
        if (typeof value !== 'string') {
            throw Error('Invalid patterns argument');
        }
    }
    return patterns;
};

openRunnerRegisterRunnerModule('requestBlocking', async ({script}) => {
    const block = async (patterns, body) => {
        const id = await script.rpcCall('requestBlocking.addPattern', {
            patterns: parsePatternArg(patterns),
        });

        if (!body) {
            return undefined; // permanent change (that is, for the duration of the script)
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
