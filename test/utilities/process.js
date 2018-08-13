#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-console */
'use strict';
const fs = require('fs');

// the process manager we are testing should kill this script but lets avoid zombie processes in case it fails:
setInterval(() => {
    process.exit(123);
}, 30000);

const ignoreExitSignals = process.argv[2] === 'IGNORE_EXIT_SIGNALS';
const logExitSignals = process.argv[2] === 'LOG_EXIT_SIGNALS';

// note: process.on('SIGTERM', ...) has no effect on windows
if (ignoreExitSignals) {
    process.on('SIGINT', () => process.stderr.write('IGNORED SIGINT\n'));
    process.on('SIGTERM', () => process.stderr.write('IGNORED SIGTERM\n'));
}
else if (logExitSignals) {
    // note: on the parent process, `childProcess.on('exit', (code, signal) => ...)`
    // will have `signal` set to `null` instead of (for example) `SIGTERM` because of the code below:
    process.on('SIGINT', () => process.stderr.write('RECEIVED SIGINT\n', () => process.exit(130)));
    process.on('SIGTERM', () => process.stderr.write('RECEIVED SIGTERM\n', () => process.exit(143)));
}

console.log('HELLO!');
console.log(JSON.stringify(process.argv));
console.log(JSON.stringify(process.env));

setTimeout(() => {
    console.log('SOMETHING TO STDOUT');

    setTimeout(() => {
        console.log('SOMETHING ELSE TO STDOUT');
        console.error('SOMETHING TO STDERR');

        if (process.argv[2] === 'EARLY_EXIT') {
            process.stderr.write('EARLY EXIT\n', () => process.exit(99));
        }

        if (process.argv[2] === 'FD3') {
            const stream = fs.createWriteStream(null, {fd: 3});
            stream.write('SOMETHING TO FILE DESCRIPTOR 3\n');
        }
    }, 25);
}, 25);
