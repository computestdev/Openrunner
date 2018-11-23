'use strict';

// Workaround until browsers implement stacks for async/await
const extendStack = async body => {
    const {stack} = Error();
    try {
        return await body();
    }
    catch (err) {
        err.stack = err.stack + stack;
        throw err;
    }
};

module.exports = extendStack;
