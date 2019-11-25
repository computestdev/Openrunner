'use strict';
const {resolve: resolvePath} = require('path');
const fs = require('fs-extra');
const Promise = require('bluebird');
const pinoPretty = require('pino-pretty')();

const {checkOptionFileAccess, checkOptionIsFile} = require('../../lib/node/cli');

const {R_OK} = fs.constants;

const replayLogHandler = async argv => {
    const optionValidationResults = await Promise.all([
        checkOptionIsFile(argv, 'result'),
        checkOptionFileAccess(argv, 'result', R_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const resultFile = resolvePath(argv.result);
    const resultContent = await fs.readFile(resultFile, 'utf8');
    const resultObject = JSON.parse(resultContent);

    for (const obj of resultObject.log) {
        if (argv.pretty) {
            console.log('%s', pinoPretty(obj));
        }
        else {
            console.log('%s', JSON.stringify(obj));
        }
    }

    return 0;
};

exports.handler = replayLogHandler;
