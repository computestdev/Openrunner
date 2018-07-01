'use strict';
const {resolve: resolvePath} = require('path');

const {buildFirefoxProfile} = require('../..');

const buildFirefoxProfileHandler = async argv => {
    const inputPath = resolvePath(argv.input);
    const outputPath = resolvePath(argv.output);
    console.log('*** Creating a new profile from', inputPath, 'at', outputPath);

    await buildFirefoxProfile({
        sourceBuildInput: inputPath,
        outputPath,
    });
    console.log('*** Done!');
    return 0;
};

exports.handler = buildFirefoxProfileHandler;
