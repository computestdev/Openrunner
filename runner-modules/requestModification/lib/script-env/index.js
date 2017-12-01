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

const parseHeadersArg = headersArg => {
    const headers = [];
    for (const [name, value] of Object.entries(headersArg)) {
        if (value !== null && typeof value !== 'string') {
            throw Error(`Invalid header value for ${name}`);
        }

        headers.push([name, value]);
    }
    return headers;
};

openRunnerRegisterRunnerModule('requestModification', async ({script}) => {
    const modifyRequestHeaders = async (patterns, headers, body) => {
        const id = await script.rpcCall('requestModification.addPattern', {
            patterns: parsePatternArg(patterns),
            headers: parseHeadersArg(headers),
            type: 'request',
        });

        if (!body) {
            return undefined; // permanent change (that is, for the duration of the script)
        }

        try {
            return await body();
        }
        finally {
            await script.rpcCall('requestModification.removePattern', {id});
        }
    };

    const modifyResponseHeaders = async (patterns, headers, body) => {
        const id = await script.rpcCall('requestModification.addPattern', {
            patterns: parsePatternArg(patterns),
            headers: parseHeadersArg(headers),
            type: 'response',
        });

        if (!body) {
            return undefined; // permanent change (that is, for the duration of the script)
        }

        try {
            return await body();
        }
        finally {
            await script.rpcCall('requestModification.removePattern', {id});
        }
    };

    return Object.freeze({
        modifyRequestHeaders,
        modifyResponseHeaders,
    });
});
