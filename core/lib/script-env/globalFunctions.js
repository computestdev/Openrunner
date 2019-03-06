'use strict';

module.exports = async script => {
    const include = async name => {
        return await script.include(name);
    };
    Object.defineProperties(include, {
        scriptApiVersion: {
            enumerable: true,
            get: () => script.scriptApiVersion,
        },
    });

    const runResult = await include('runResult');
    const transaction = (...args) => runResult.scriptResult.transaction(...args);

    return {include, transaction};
};
