#!/usr/bin/env node
'use strict';
/* eslint-env node */
const yargs = require('yargs');
const {tmpdir} = require('os');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {checkOptionFileAccess, checkOptionIsFile, checkOptionIsDirectory} = require('../lib/node/cli');
const {buildTempFirefoxProfile} = require('../building');
const {startFirefox} = require('../lib/node/firefoxProcess');

const execute = async rawArgv => {
    const {argv} = (
        yargs(rawArgv)
        .usage(
            '$0',
            'Start the Openrunner IDE using the specified web browser'
        )
        .option('firefox', {
            describe: 'Filesystem path to the binary of Firefox Unbranded or Developer Edition',
            demandOption: true,
        })
        .option('tmp', {
            describe: 'Filesystem path to a directory to temporarily store files in, such as the profile used by the browser',
            default: tmpdir(),
        })
        .help('help')
    );

    try {
        const optionValidationResults = await Promise.all([
            checkOptionIsFile(argv, 'firefox'),
            checkOptionFileAccess(argv, 'firefox', fs.constants.R_OK | fs.constants.X_OK),
            checkOptionIsDirectory(argv, 'tmp'),
            checkOptionFileAccess(argv, 'tmp', fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK),
        ]);

        if (!Math.min(...optionValidationResults)) {
            return 1;
        }

        const {tmp: tempDirectory, firefox: firefoxPath} = argv;
        const profileOptions = {tempDirectory};

        await Promise.using(buildTempFirefoxProfile(profileOptions), async profilePath => {
            return await Promise.using(startFirefox({firefoxPath, profilePath}), async firefoxProcess => {
                await firefoxProcess.waitForChildStop();
            });
        });

        return 0;
    }
    catch (err) {
        console.error(`There was an unexpected error while starting Openrunner: ${err.message}\n${err.stack}`);
        return 2;
    }
};

module.exports = execute;

if (require.main === module) {
    execute(process.argv).then(exitCode => {
        process.exitCode = exitCode;
    });
}
