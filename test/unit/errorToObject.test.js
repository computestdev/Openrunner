'use strict';

const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, isObject, strictEqual: eq}} = require('chai');

const errorToObject = require('../../lib/errorToObject');

describe('errorToObject', () => {
    it('Should convert an Error to a pojo', () => {
        const error = Error('foo');
        error.name = 'SomeError';
        const result = errorToObject(error);

        isObject(result, 'result should be a plain old javascript object');
        eq(Object.getPrototypeOf(Object.getPrototypeOf(result)), null, 'result should be a plain old javascript object');
        deq(result, {
            columnNumber: error.columnNumber,
            fileName: error.fileName,
            lineNumber: error.lineNumber,
            message: 'foo',
            name: 'SomeError',
            code: undefined,
            cause: undefined,
            stack: error.stack,
        });
    });

    it('Should include the `code` property if present', () => {
        const error = Error('foo');
        error.code = 'FOO_NOT_FOUND';
        const result = errorToObject(error);

        deq(result, {
            columnNumber: error.columnNumber,
            fileName: error.fileName,
            lineNumber: error.lineNumber,
            message: 'foo',
            name: 'Error',
            code: 'FOO_NOT_FOUND',
            cause: undefined,
            stack: error.stack,
        });
    });

    it('Should include firefox specific error properties', () => {
        const error = Error('foo');
        error.columnNumber = 123;
        error.fileName = 'foo.js';
        error.lineNumber = 123;
        const result = errorToObject(error);

        deq(result, {
            columnNumber: error.columnNumber,
            fileName: error.fileName,
            lineNumber: error.lineNumber,
            message: 'foo',
            name: 'Error',
            code: undefined,
            cause: undefined,
            stack: error.stack,
        });
    });

    it('Should convert the `cause` property as an error, if present', () => {
        const error = Error('foo');
        const cause = Error('bar');
        error.cause = cause;
        const result = errorToObject(error);

        deq(result, {
            columnNumber: error.columnNumber,
            fileName: error.fileName,
            lineNumber: error.lineNumber,
            message: 'foo',
            name: 'Error',
            code: undefined,
            stack: error.stack,
            cause: {
                columnNumber: cause.columnNumber,
                fileName: cause.fileName,
                lineNumber: cause.lineNumber,
                message: 'bar',
                name: 'Error',
                code: undefined,
                stack: cause.stack,
                cause: undefined,
            },
        });
    });

    it('Should return null for falsy values', () => {
        eq(errorToObject(null), null);
        eq(errorToObject(0), null);
        eq(errorToObject(), null);
    });
});
