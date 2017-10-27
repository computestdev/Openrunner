'use strict';

module.exports = async script => {
    const include = async name => {
        return await script.include(name);
    };

    const runResult = await include('runResult');
    const transaction = (...args) => runResult.scriptResult.transaction(...args);

    return {include, transaction};
};
