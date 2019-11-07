'use strict';
const {resolve: resolvePath} = require('path');
const fs = require('fs-extra');

const {buildFirefoxExtension} = require('../..');
const {checkOptionFileAccess, checkOptionIsDirectory} = require('../../lib/node/cli');

const {R_OK, X_OK, W_OK} = fs.constants;

const buildExtensionHandler = async argv => {
    const optionValidationResults = await Promise.all([
        checkOptionIsDirectory(argv, 'tmp'),
        checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const outputPath = resolvePath(argv.output);
    console.log('*** Building extension at', outputPath);

    await buildFirefoxExtension({
        tempDirectory: argv.tmp,
        outputPath,
        extensionOptions: {
            cncPort: argv.cncPort,
            instrumentCoverage: argv.coverage,
        },
        zipped: Boolean(argv.xpi),
    });
    console.log('*** Done!');
    return 0;
};

exports.handler = buildExtensionHandler;
