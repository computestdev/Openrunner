#!/usr/bin/env node
'use strict';
/* eslint-env node */
/* eslint-disable max-nested-callbacks */
const yargs = require('yargs');
const {tmpdir} = require('os');
const path = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');

const {CnCServer} = require('..');

const {buildTempFirefoxProfile, buildCachedTempFirefoxProfile} = require('../building');
const {checkOptionFileAccess, checkOptionIsFile, checkOptionIsDirectory} = require('../lib/node/cli');
const {ERROR_FAILED_TO_CREATE_PROFILE_CACHE, startFirefox} = require('../lib/node/firefoxProcess');
const {ERROR_FAILED_TO_OPEN_RESULT_FILE, resultFileOutput} = require('../lib/node/runResult');
const log = require('../lib/logger')({MODULE: 'bin/openrunner'});

const execute = async rawArgv => {
    const {argv} = (
        yargs(rawArgv)
        .usage(
            '$0',
            'Run the given Openrunner script and store the results of the run. A web browser will be started temporarily to run the ' +
            'script with.'
        )
        .option('firefox', {
            describe: 'Filesystem path to the binary of Firefox Unbranded or Nightly or Developer Edition',
            demandOption: true,
        })
        .option('script', {
            alias: 's',
            describe: 'Filesystem path to an Openrunner script to run. If this option is not given, the Openrunner IDE will start instead',
            demandOption: true,
        })
        .option('result', {
            alias: 'r',
            describe: 'Filesystem path where a JSON file containing the results of the script run will be stored. ' +
            'If this option is given, the --script must also be given',
        })
        .option('headless', {
            alias: 'h',
            describe: 'Run the browser in headless mode. The browser is run as normal, minus any visible UI components visible',
            boolean: true,
        })
        .option('tmp', {
            describe: 'Filesystem path to a directory to temporarily store files in, such as the profile used by the browser',
            default: tmpdir(),
        })
        .option('profileCache', {
            describe: 'Filesystem path to a directory where the generated browser profile will be cached between multiple ' +
                      'invocations of this command. If this option is not given, a new browser profile will be ' +
                      'generated for every single invocation',
        })
        .option('cncPort', {
            describe: 'The TCP port used to communicate with the browser. A web server will be started (temporarily) at this port ' +
                      'on the loopback interface. If "0" is passed an unused port is picked by the OS however this can not ' +
                      'be used at the same time as the --profileCache option',
            number: true,
            default: 17011,
        })
        .help('help')
    );

    try {
        const optionValidationResults = await Promise.all([
            checkOptionIsFile(argv, 'firefox'),
            checkOptionFileAccess(argv, 'firefox', fs.constants.R_OK | fs.constants.X_OK),
            checkOptionIsFile(argv, 'script'),
            checkOptionFileAccess(argv, 'script', fs.constants.R_OK),
            checkOptionIsDirectory(argv, 'tmp'),
            checkOptionFileAccess(argv, 'tmp', fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK),
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

        const {cncPort, profileCache, tmp: tempDirectory, result: resultFile, script: scriptFile, firefox: firefoxPath, headless} = argv;
        const scriptContent = await fs.readFile(scriptFile, 'utf8');
        const stackFileName = path.basename(scriptFile);

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
            if (argv.profileCache) {
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
            process.exitCode = 1;
            return 1;
        }

        if (err[ERROR_FAILED_TO_CREATE_PROFILE_CACHE]) {
            console.error(`Invalid value for option --profileCache : ${err.message}`);
            process.exitCode = 1;
            return 1;
        }

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
