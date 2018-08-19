'use strict';

/**
 * Parses the message.reject object received over RPC by the remote frame.
 * For example as a response to tab.run() / frame.run()
 * @param {?Object} rpcRejectObject
 * @throws {Error} If rpcRejectObject is not falsy
 */
const maybeThrowUserScriptError = rpcRejectObject => {
    if (rpcRejectObject) {
        const err = new Error(rpcRejectObject.message);
        err.data = rpcRejectObject.data;
        err.name = rpcRejectObject.name;
        err.stack = rpcRejectObject.stack;
        throw err;
    }
};

module.exports = maybeThrowUserScriptError;
