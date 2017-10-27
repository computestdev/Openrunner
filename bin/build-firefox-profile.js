'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const yargs = require('yargs');

const {buildFirefoxProfile} = require('../building');

const {argv} = (
    yargs
    .option('input', {
        alias: 'i',
        describe: 'Input directory, containing a previously generated source build',
        demandOption: true,
    })
    .option('output', {
        alias: 'o',
        describe: 'Profile output directory',
        demandOption: true,
    })
    .help('help')
);


(async () => {
    const inputPath = resolvePath(argv.input);
    const outputPath = resolvePath(argv.output);
    console.log('*** Creating a new profile from', inputPath, 'at', outputPath);

    try {
        await buildFirefoxProfile({
            sourceBuildInput: inputPath,
            outputPath,
        });
        console.log('*** Done!');
    }
    catch (err) {
        console.error('Error during build!', err);
        process.exitCode = 1;
    }
})();
