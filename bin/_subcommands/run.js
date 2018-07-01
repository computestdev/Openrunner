'use strict';
const {resolve: resolvePath, basename} = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {CnCServer} = require('../..');
const {buildTempFirefoxProfile, buildCachedTempFirefoxProfile} = require('../../building');
const {checkOptionFileAccess, checkOptionIsFile, checkOptionIsDirectory} = require('../../lib/node/cli');
const {ERROR_FAILED_TO_CREATE_PROFILE_CACHE, startFirefox} = require('../../lib/node/firefoxProcess');
const {ERROR_FAILED_TO_OPEN_RESULT_FILE, resultFileOutput} = require('../../lib/node/runResult');
const log = require('../../lib/logger')({MODULE: 'bin/openrunner'});

const {R_OK, X_OK, W_OK} = fs.constants;

const runHandler = async argv => {
    try {
        const optionValidationResults = await Promise.all([
            checkOptionIsFile(argv, 'firefox'),
            checkOptionFileAccess(argv, 'firefox', R_OK | X_OK),
            checkOptionIsFile(argv, 'script'),
            checkOptionFileAccess(argv, 'script', R_OK),
            checkOptionIsDirectory(argv, 'tmp'),
            checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
        ]);

        if (!Math.min(...optionValidationResults)) {
            return 1;
        }

        if (argv.cncPort < 1 && argv.profileCache) {
            // cncPort=0 means that the OS will pick any unused one. And since we have to hard code
            // the cncPort into the profile, the cache would be useless
            console.error('The --profileCache option may not be used if the --cncPort option is set to 0');
            return 1;
        }

        const {cncPort, result: resultFile, headless} = argv;
        const tempDirectory = resolvePath(argv.tmp);
        const firefoxPath = resolvePath(argv.firefox);
        const scriptFile = resolvePath(argv.script);
        const profileCache = argv.profileCache && resolvePath(argv.profileCache);
        const scriptContent = await fs.readFile(scriptFile, 'utf8');
        const stackFileName = basename(scriptFile);

        const startAndRunScript = async ({profilePath, cncServer}) => {
            return await Promise.using(startFirefox({firefoxPath, profilePath, headless}), async () => {
                log.debug('Waiting for C&C connection...');
                await cncServer.waitForActiveConnection();
                log.info({stackFileName}, 'Sending runScript command...');
                return await cncServer.runScript({scriptContent, stackFileName});
            });
        };

        // open the result file before starting the script, so that we catch errors early
        await Promise.using(resultFileOutput(resultFile), CnCServer.promiseDisposer(cncPort), async (writeResultFile, cncServer) => {
            const profileOptions = {tempDirectory, cncPort: cncServer.listenPort, profileCache};

            let scriptResult;
            if (profileCache) {
                const profilePath = await buildCachedTempFirefoxProfile({tempDirectory, cncPort: cncServer.listenPort, profileCache});
                scriptResult = await startAndRunScript({profilePath, cncServer});
            }
            else {
                scriptResult = await Promise.using(buildTempFirefoxProfile(profileOptions), async profilePath => {
                    return await startAndRunScript({profilePath, cncServer});
                });
            }

            log.info({stackFileName}, 'Script run completed');
            if (writeResultFile) {
                await writeResultFile(JSON.stringify(scriptResult, null, 4));
            }
        });

        return 0;
    }
    catch (err) {
        if (err[ERROR_FAILED_TO_OPEN_RESULT_FILE]) {
            console.error(`Invalid value for option --result : ${err.message}`);
            return 1;
        }

        if (err[ERROR_FAILED_TO_CREATE_PROFILE_CACHE]) {
            console.error(`Invalid value for option --profileCache : ${err.message}`);
            return 1;
        }

        throw err;
    }
};

exports.handler = runHandler;
