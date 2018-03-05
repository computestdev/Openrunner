/* eslint-env node */
/* eslint-disable no-console */
'use strict';
const fs = require('fs-extra');

const createOptionChecker = condition => async (argv, name, ...args) => {
    const value = argv[name];
    try {
        await condition(value, ...args);
        return true;
    }
    catch (err) {
        console.error(`Invalid value for option --${name} : ${err.message}`);
        return false;
    }
};

const checkOptionFileAccess = createOptionChecker(async (value, access) => fs.access(value, access));
const checkOptionIsFile = createOptionChecker(async (value) => {
    const stat = await fs.stat(value);
    if (!stat.isFile()) {
        throw Error('Is not a regular file');
    }
});

const checkOptionIsDirectory = createOptionChecker(async (value) => {
    const stat = await fs.stat(value);
    if (!stat.isDirectory()) {
        throw Error('Is not a directory');
    }
});

module.exports = {
    checkOptionFileAccess,
    checkOptionIsFile,
    checkOptionIsDirectory,
    _fs: fs,
};
