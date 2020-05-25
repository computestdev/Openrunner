'use strict';
const {resolve: resolvePath} = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {OpenrunnerClient} = require('../..');
const {checkOptionFileAccess, checkOptionIsDirectory} = require('../../lib/node/cli');

const {R_OK, X_OK, W_OK} = fs.constants;

const ideHandler = async argv => {
    const optionValidationResults = await Promise.all([
        checkOptionFileAccess(argv, 'firefox', R_OK | X_OK),
        checkOptionIsDirectory(argv, 'tmp'),
        checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const preloadExtension = Boolean(argv.preloadExtension);
    const tempDirectory = resolvePath(argv.tmp);
    const firefoxPath = resolvePath(argv.firefox);
    const {proxy} = argv;

    await Promise.using(
        OpenrunnerClient.promiseDisposer({
            firefoxPath,
            tempDirectory,
            preloadExtension,
            headless: false,
            proxy,
        }),
        async openrunner => {
            await openrunner.waitForChildStop();
        },
    );
    return 0;
};

exports.handler = ideHandler;
