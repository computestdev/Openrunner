'use strict';

const createRpcRequestError = obj => {
    if (!obj) {
        return obj;
    }

    const err = Error(obj.message);
    err.stack = obj.stack + '\n' + err.stack;
    err.name = `RPCRequestError<${obj.name}>`;
    err.code = obj.code;
    err.cause = obj;
    err.columnNumber = obj.columnNumber;
    err.fileName = obj.fileName;
    err.lineNumber = obj.lineNumber;
    return err;
};

module.exports = createRpcRequestError;
