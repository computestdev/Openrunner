'use strict';
const {resolve: resolvePath, basename} = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {OpenrunnerClient} = require('../..');
const {checkOptionFileAccess, checkOptionIsFile, checkOptionIsDirectory} = require('../../lib/node/cli');
const {
    ERROR_FAILED_TO_CREATE_PROFILE_CACHE,
    ERROR_FAILED_TO_CREATE_EXTENSION_CACHE,
} = require('../../lib/node/firefoxProcess');
const {ERROR_FAILED_TO_OPEN_RESULT_FILE, resultFileOutput} = require('../../lib/node/runResult');
const log = require('../../lib/logger')({MODULE: 'bin/openrunner'});

const {R_OK, X_OK, W_OK} = fs.constants;

const runHandler = async argv => {
    try {
        const optionValidationResults = await Promise.all([
            checkOptionFileAccess(argv, 'firefox', R_OK | X_OK),
            checkOptionIsFile(argv, 'script'),
            checkOptionFileAccess(argv, 'script', R_OK),
            checkOptionIsDirectory(argv, 'tmp'),
            checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
        ]);

        if (!Math.min(...optionValidationResults)) {
            return 1;
        }

        if (argv.cncPort < 1 && argv.buildCache) {
            // cncPort=0 means that the OS will pick any unused one. And since we have to hard code
            // the cncPort into the profile, the cache would be useless
            console.error('The --buildCache option may not be used if the --cncPort option is set to 0');
            return 1;
        }

        const {cncPort, result: resultFile, headless, proxy} = argv;
        const preloadExtension = Boolean(argv.preloadExtension);
        const tempDirectory = resolvePath(argv.tmp);
        const firefoxPath = resolvePath(argv.firefox);
        const scriptFile = resolvePath(argv.script);
        const buildCacheDirectory = argv.buildCache && resolvePath(argv.buildCache);
        const scriptContent = await fs.readFile(scriptFile, 'utf8');
        const stackFileName = basename(scriptFile);

        // open the result file before starting the script, so that we catch errors early
        await Promise.using(
            resultFileOutput(resultFile),
            OpenrunnerClient.promiseDisposer({
                firefoxPath,
                tempDirectory,
                preloadExtension,
                headless: Boolean(headless),
                cncPort,
                buildCacheDirectory,
                proxy,
            }),
            async (writeResultFile, openrunner) => {
                const scriptResult = await openrunner.runScript({scriptContent, stackFileName});
                log.info({stackFileName}, 'Script run completed');

                if (writeResultFile) {
                    await writeResultFile(JSON.stringify(scriptResult, null, 4));
                }
            },
        );

        return 0;
    }
    catch (err) {
        if (err[ERROR_FAILED_TO_OPEN_RESULT_FILE]) {
            console.error(`Invalid value for option --result : ${err.message}`);
            return 1;
        }

        if (err[ERROR_FAILED_TO_CREATE_PROFILE_CACHE] || err[ERROR_FAILED_TO_CREATE_EXTENSION_CACHE]) {
            console.error(`Invalid value for option --buildCache : ${err.message}`);
            return 1;
        }

        throw err;
    }
};

exports.handler = runHandler;
