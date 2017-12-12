'use strict';

const tryValue = (obj, name, replacement = '###inaccessible###') => {
    try {
        return obj[name];
    }
    catch (err) {
        // One case where this can happen is with errors from a different sandboxed realm
        // which would give us a security error
        return replacement;
    }
};

/**
 * @param {Error} error
 * @return {{columnNumber: number, fileName: string, lineNumber: number, message: string, name: string, stack: string}}
 */
const errorToObject = error => {
    if (!error) {
        return null;
    }

    const columnNumber = tryValue(error, 'columnNumber', undefined);
    const fileName = tryValue(error, 'fileName');
    const lineNumber = tryValue(error, 'lineNumber', undefined);
    const message = tryValue(error, 'message');
    const name = tryValue(error, 'name');
    const code = tryValue(error, 'code');
    const cause = tryValue(error, 'cause', null);
    const stack = tryValue(error, 'stack');

    return {
        message:      String(message),
        name:         String(name),
        code:         code && String(code),
        stack:        String(stack),
        fileName:     fileName === undefined ? undefined : String(fileName),
        lineNumber:   lineNumber === undefined ? undefined : Number(lineNumber),
        columnNumber: columnNumber === undefined ? undefined : Number(columnNumber),
        cause:        cause && errorToObject(cause),
    };
};

module.exports = errorToObject;
