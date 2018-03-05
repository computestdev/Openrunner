#!/usr/bin/env node
'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const yargs = require('yargs');

const {buildSources} = require('../building');

const execute = async rawArgv => {
    const {argv} = (
        yargs(rawArgv)
        .option('output', {
            alias: 'o',
            describe: 'Build output directory',
            demandOption: true,
        })
        .option('cncPort', {
            describe:
            'If set, the resulting extension build will automatically try to connect to this WebSocket port on the loopback interface, ' +
            'to receive JSON-RPC 2 calls',
            number: true,
            default: 0,
            defaultDescription: 'disabled',
        })
        .option('coverage', {
            describe: 'Add coverage instrumentation',
            boolean: true,
        })
        .help('help')
    );

    (async () => {
        const outputPath = resolvePath(argv.output);
        console.log('*** Building sources at', outputPath);

        try {
            await buildSources({
                outputPath,
                cncPort: argv.cncPort,
                instrumentCoverage: argv.coverage,
            });
            console.log('*** Done!');
        }
        catch (err) {
            console.error('Error during build!', err);
            process.exitCode = 1;
        }
    })();
};

module.exports = execute;

if (require.main === module) {
    execute(process.argv).then(exitCode => {
        process.exitCode = exitCode;
    });
}
