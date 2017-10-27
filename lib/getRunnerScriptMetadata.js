'use strict';
const metaDataParser = require('performr-runner-metadata-parser');

const parseTimeoutArgument = require('./parseTimeoutArgument');
const log = require('./logger')({hostname: 'background', MODULE: 'getRunnerScriptMetadata'});

const DEFAULT_RUN_TIMEOUT = 60 * 1000;

const getRunnerScriptMetadata = (scriptContent) => {
    let scriptApiVersion = null;
    let runTimeoutMs = DEFAULT_RUN_TIMEOUT;
    const metaData = metaDataParser(scriptContent).filter(entry => /^openrunner-/i.test(entry.key));

    for (const {key, value} of metaData) {
        const lowerKey = key.toLowerCase();
        if (!scriptApiVersion && lowerKey === 'openrunner-script') {
            scriptApiVersion = value;
        }
        else if (lowerKey === 'openrunner-script-timeout') {
            const valueMatch = /^\s*(\d+(s)?)\s*$/.exec(value);

            if (!valueMatch) {
                throw Error(
                    `Invalid syntax for Openrunner-Script-Timeout`
                );
            }

            const timeoutValue = valueMatch[2]
                ? parseTimeoutArgument(valueMatch[1])
                : parseTimeoutArgument(parseInt(valueMatch[1], 10));

            if (timeoutValue > 0) {
                runTimeoutMs = timeoutValue;
            }
        }
    }

    if (!scriptApiVersion) {
        log.warn('"Openrunner-Script" metadata literal is missing');
        throw Error(
            `The mandatory "Openrunner-Script" metadata literal is missing within the given Openrunner script. ` +
            `The line   'Openrunner-Script: v1';   should be added to the top of your script.`
        );
    }

    if (scriptApiVersion !== 'v1') {
        log.warn({scriptApiVersion}, 'Invalid API version');
        throw Error(
            `The given Openrunner script specified an API version (e.g. 'Openrunner-Script: v123') which is not supported ` +
            `by this script runner. Version given: "${scriptApiVersion}"; Supported: "v1"`
        );
    }

    return {
        scriptApiVersion,
        runTimeoutMs,
    };
};

module.exports = getRunnerScriptMetadata;

