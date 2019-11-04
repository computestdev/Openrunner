'use strict';
/* eslint-env node */
const Promise = require('bluebird');
const path = require('path');
const fs = require('fs-extra');
require('chai').use(require('chai-as-promised'));
const {assert: {isOk, isNotOk, isRejected, strictEqual: eq}} = require('chai');
const {describe, it, beforeEach} = require('mocha-sugar-free');

const {temporaryDirectory} = require('../../../lib/node/temporaryFs');
const {resultFileOutput, ERROR_FAILED_TO_OPEN_RESULT_FILE} = require('../../../lib/node/runResult');
const {TEST_TEMP_DIR} = require('../../utilities/testEnv');

describe('node/runResult', () => {
    beforeEach(async () => {
        isOk(TEST_TEMP_DIR, 'TEST_TEMP_DIR must not be empty');
        await fs.mkdirp(TEST_TEMP_DIR);
    });

    describe('resultFileOutput()', () => {
        it('Should open the file before resolving the promise and provide a callback to write to it', async () =>
            Promise.using(temporaryDirectory(TEST_TEMP_DIR, ['test']), async ([tempDir]) => {
                const resultFilePath = path.join(tempDir, 'result.json');

                await Promise.using(resultFileOutput(resultFilePath), async writeResultFile => {
                    isOk(await fs.pathExists(resultFilePath), 'result file should already exist');
                    await writeResultFile('{"foo": "bar"}');
                });

                eq(await fs.readFile(resultFilePath, 'utf8'), '{"foo": "bar"}');
            }),
        );

        it('Should remove the file if an error occurs during the using block', async () =>
            Promise.using(temporaryDirectory(TEST_TEMP_DIR, ['test']), async ([tempDir]) => {
                const resultFilePath = path.join(tempDir, 'result.json');

                const promise = Promise.using(resultFileOutput(resultFilePath), async writeResultFile => {
                    throw Error('Error from test!');
                });
                await isRejected(promise, Error, 'Error from test!');

                isNotOk(await fs.pathExists(resultFilePath), 'result file should no longer exist');
            }),
        );

        it('Should not create a file if no path is given', async () => {
            await Promise.using(resultFileOutput(null), async writeResultFile => {
                eq(writeResultFile, null);
            });
        });

        it('Should reject if the file can not be opened', () => {
            Promise.using(temporaryDirectory(TEST_TEMP_DIR, ['test']), async ([tempDir]) => {
                const promise = Promise.using(resultFileOutput(tempDir), async writeResultFile => {
                    throw Error('Should not be reachable!');
                });
                await isRejected(promise, Error, /EISDIR.*open/);
                await promise.catch(err => eq(err[ERROR_FAILED_TO_OPEN_RESULT_FILE], true));
            });
        });
    });
});
