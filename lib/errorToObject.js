'use strict';

/**
 * @param {Error} error
 * @return {{columnNumber: number, fileName: string, lineNumber: number, message: string, name: string, stack: string}}
 */
const errorToObject = error => {
    if (!error) {
        return null;
    }

    return {
        columnNumber: 'columnNumber' in error ? Number(error.columnNumber) : undefined,
        fileName:     'fileName' in error ? String(error.fileName) : undefined,
        lineNumber:   'lineNumber' in error ? Number(error.lineNumber) : undefined,
        message:      String(error.message),
        name:         String(error.name),
        code:         error.code && String(error.code),
        cause:        error.cause && errorToObject(error.cause),
        stack:        String(error.stack),
    };
};

module.exports = errorToObject;
