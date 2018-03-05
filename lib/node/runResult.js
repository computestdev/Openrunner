'use strict';
const fs = require('fs-extra');
const Promise = require('bluebird');

const ERROR_FAILED_TO_OPEN_RESULT_FILE = Symbol();
const FD = Symbol();

const resultFileOutput = path => Promise.try(async () => {
    if (!path) {
        return null;
    }

    const resultFileFd = await fs.open(path, 'w').catch(err => {
        err[ERROR_FAILED_TO_OPEN_RESULT_FILE] = true;
        throw err;
    });

    const writeResultFile = async str => {
        await fs.write(resultFileFd, str, undefined, 'utf8');
    };
    writeResultFile[FD] = resultFileFd;

    return writeResultFile;
})
.disposer(async (writeResultFile, promise) => {
    if (!writeResultFile) {
        return;
    }

    await fs.close(writeResultFile[FD]);
    if (promise.isRejected()) {
        await fs.unlink(path); // clean up our bad result file, which has been created by open()
    }
});

module.exports = {ERROR_FAILED_TO_OPEN_RESULT_FILE, resultFileOutput};
