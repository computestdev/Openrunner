'use strict';
const {resolve: resolvePath} = require('path');

const {buildSources} = require('../..');

const buildSourceHandler = async argv => {
    const outputPath = resolvePath(argv.output);
    console.log('*** Building sources at', outputPath);

    await buildSources({
        outputPath,
        cncPort: argv.cncPort,
        instrumentCoverage: argv.coverage,
    });
    console.log('*** Done!');
    return 0;
};

exports.handler = buildSourceHandler;
