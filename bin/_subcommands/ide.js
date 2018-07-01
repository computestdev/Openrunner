'use strict';
const {resolve: resolvePath} = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {checkOptionFileAccess, checkOptionIsFile, checkOptionIsDirectory} = require('../../lib/node/cli');
const {buildTempFirefoxProfile} = require('../../building');
const {startFirefox} = require('../../lib/node/firefoxProcess');

const {R_OK, X_OK, W_OK} = fs.constants;

const ideHandler = async argv => {
    const optionValidationResults = await Promise.all([
        checkOptionIsFile(argv, 'firefox'),
        checkOptionFileAccess(argv, 'firefox', R_OK | X_OK),
        checkOptionIsDirectory(argv, 'tmp'),
        checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const tempDirectory = resolvePath(argv.tmp);
    const firefoxPath = resolvePath(argv.firefox);
    const profileOptions = {tempDirectory};

    await Promise.using(buildTempFirefoxProfile(profileOptions), async profilePath => {
        return await Promise.using(startFirefox({firefoxPath, profilePath}), async firefoxProcess => {
            await firefoxProcess.waitForChildStop();
        });
    });

    return 0;
};

exports.handler = ideHandler;
