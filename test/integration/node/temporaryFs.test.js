'use strict';
/* eslint-env node */
const Promise = require('bluebird');
const path = require('path');
const fs = require('fs-extra');
const {assert: {isOk, isNotOk, match, include, notEqual}} = require('chai');
const {describe, it, beforeEach} = require('mocha-sugar-free');

const {temporaryDirectory} = require('../../../lib/node/temporaryFs');
const {TEST_TEMP_DIR} = require('../../utilities/testEnv');

describe('node/temporaryFs', () => {
    beforeEach(async () => {
        isOk(TEST_TEMP_DIR, 'TEST_TEMP_DIR must not be empty');
        await fs.mkdirp(TEST_TEMP_DIR);
    });

    describe('temporaryDirectory()', () => {
        it('Should create unique temporary directories and clean them up using a bluebird Disposer', async () => {
            let oldFooPath;
            let oldFoo2Path;
            let oldBarPath;

            await Promise.using(temporaryDirectory(TEST_TEMP_DIR, ['foo-', 'foo-', 'bar-']), async ([fooPath, foo2Path, barPath]) => {
                oldFooPath = fooPath;
                oldFoo2Path = foo2Path;
                oldBarPath = barPath;
                match(fooPath, /foo-\w+$/);
                match(foo2Path, /foo-\w+$/);
                match(barPath, /bar-\w+$/);
                notEqual(fooPath, foo2Path);

                include(fooPath, TEST_TEMP_DIR);
                include(foo2Path, TEST_TEMP_DIR);
                include(barPath, TEST_TEMP_DIR);
                const fooStat = await fs.stat(fooPath);
                const foo2Stat = await fs.stat(foo2Path);
                const barStat = await fs.stat(barPath);
                isOk(fooStat.isDirectory(), 'fooPath should be a directory');
                isOk(foo2Stat.isDirectory(), 'foo2Path should be a directory');
                isOk(barStat.isDirectory(), 'barPath should be a directory');

                for (const file of await fs.readdir(fooPath)) {
                    match(file, /^\.\.?$/, 'fooPath should be empty');
                }
                for (const file of await fs.readdir(foo2Path)) {
                    match(file, /^\.\.?$/, 'foo2Path should be empty');
                }
                for (const file of await fs.readdir(barPath)) {
                    match(file, /^\.\.?$/, 'barPath should be empty');
                }

                // add some files to test if the directories are cleaned up properly
                // - keep fooPath empty
                // - add some files to foo2Path
                // - add some directories and files to barPath
                await fs.writeFile(path.join(foo2Path, 'abc'), 'Hellow!');
                await fs.writeFile(path.join(foo2Path, 'def'), 'Hellow!');
                await fs.mkdirp(path.join(barPath, '123', '456'));
                await fs.writeFile(path.join(barPath, '123', '456', 'abc'), 'Hellow!');
            });

            isNotOk(await fs.pathExists(oldFooPath), 'fooPath should have been removed');
            isNotOk(await fs.pathExists(oldFoo2Path), 'fooPath should have been removed');
            isNotOk(await fs.pathExists(oldBarPath), 'fooPath should have been removed');
        });
    });
});
