#!/usr/bin/env node
'use strict';
/* eslint-env node */
/* eslint-disable global-require */
const yargs = require('yargs');
const {tmpdir} = require('os');

const firefoxOption = ['firefox', {
    describe: 'Filesystem path to the binary of Firefox Unbranded or Developer Edition or Nightly',
    demandOption: true,
}];

const tmpOption = ['tmp', {
    describe: 'Filesystem path to a directory to temporarily store files in, such as build files and the profile used by the browser',
    default: tmpdir(),
}];

const headlessOption = ['headless', {
    alias: 'h',
    describe: 'Run the browser in headless mode. The browser is run as normal, minus any visible UI components visible',
    boolean: true,
}];

const preloadExtensionOption = ['preloadExtension', {
    describe:
        'Install the Openrunner extension by placing it in the generated firefox profile, instead of installing it using the ' +
        'debugger API. This option only works on Firefox Developer Edition, Addon Devel, Nightly, etc',
    boolean: true,
}];

const cncPortOption = ['cncPort', {
    describe:
        'If set, the built extension will automatically try to connect to this WebSocket port on the loopback interface, ' +
        'to receive JSON-RPC 2 calls',
    number: true,
    default: 0,
    defaultDescription: 'disabled',
}];

const buildCacheOption = ['buildCache', {
    describe: 'Filesystem path to a directory where the generated browser profile and extension will be cached between multiple ' +
              'invocations of this command. If this option is not given, a new browser profile and extension will be ' +
              'generated for every single invocation',
}];

const buildOutputOption = ['output', {
    alias: 'o',
    describe: 'Build output directory',
    demandOption: true,
}];

const coverageOption = ['coverage', {
    describe: 'Add coverage instrumentation',
    boolean: true,
}];

const verbose = ['verbose', {
    describe: 'Enable verbose logging',
    boolean: true,
}];

const pretty = ['pretty', {
    describe: 'Prettify logging output. Pass --no-pretty to disable',
    boolean: true,
    default: true,
}];

const executeCommandHandler = (modulePath, args) => {
    // We use a lazy require here to prevent having to require the majority of the openrunner and
    // node_module source whenever we invoke something like `--help`, `--get-yargs-completions`, etc.

    const {setHandler: setLogHandler} = require('../lib/logger');


    const {verbose, pretty} = args;
    let pinoPretty;
    if (pretty) {
        pinoPretty = require('pino-pretty')();
    }

    setLogHandler(obj => {
        if (!verbose && obj.level < 50) { // 50 = error
            return;
        }

        if (pretty) {
            console.log('%s', pinoPretty(obj));
        }
        else {
            console.log('%s', JSON.stringify(obj));
        }
    });


    const func = require(modulePath).handler;

    func(args).then(
        exitCode => {
            process.exitCode = exitCode;
        },
        err => {
            console.error('Error while executing command!');
            console.error(err, err.stack);
            process.exitCode = 99;
        },
    );
};

yargs
.wrap(yargs.terminalWidth())
.env('OPENRUNNER')
.option(...pretty)
.option(...verbose)
.command({
    command: 'ide',
    describe: 'Launch the Openrunner IDE',
    builder: yargs =>
        yargs
        .group(['firefox'], 'Basic options')
        .option(...firefoxOption)
        .group(['tmp', 'preloadExtension'], 'Advanced options')
        .option(...tmpOption)
        .option(...preloadExtensionOption)
        .example('$0 ide --firefox \'/Volumes/Applications/Firefox.app\''),
    handler: args => executeCommandHandler('./_subcommands/ide', args),
})
.command({
    command: 'run',
    describe: 'Run the given Openrunner script and store the results of the run. A web browser will be started temporarily to run the ' +
              'script with.',
    builder: yargs =>
        yargs
        .group(['firefox', 'script', 'result', 'headless'], 'Basic options')
        .option(...firefoxOption)
        .option('script', {
            alias: 's',
            describe: 'Filesystem path to an Openrunner script to run',
            demandOption: true,
        })
        .option('result', {
            alias: 'r',
            describe: 'Filesystem path where a JSON file containing the results of the script run will be stored',
        })
        .option(...headlessOption)
        .group(['tmp', 'buildCache', 'cncPort', 'preloadExtension'], 'Advanced options')
        .option(...tmpOption)
        .option(...buildCacheOption)
        .option(...preloadExtensionOption)
        .option('cncPort', {
            describe: 'The TCP port used to communicate with the browser. A web server will be started (temporarily) at this port ' +
            'on the loopback interface. If "0" is passed an unused port is picked by the OS however this can not ' +
            'be used at the same time as the --buildCache option',
            number: true,
            default: 17011,
        })
        .example(
            '$0 run --firefox \'/Volumes/Applications/Firefox.app\' ' +
            '--script example.js --result example.json',
        ),
    handler: args => executeCommandHandler('./_subcommands/run', args),
})
.command({
    command: 'build',
    describe: 'Various commands for building browser extensions and profiles',
    builder: yargs =>
        yargs
        // this command is mostly useful while developing Openrunner. See `npm run build:sources`
        .command({
            command: 'source',
            describe: false, // hide it from --help unless explicitly specified
            builder: yargs =>
                yargs
                .group(['output'], 'Basic options')
                .option(...buildOutputOption)
                .group(['coverage', 'cncPort'], 'Advanced options')
                .option(...coverageOption)
                .option(...cncPortOption)
                .example('$0 build source --output ./openrunner-source'),
            handler: args => executeCommandHandler('./_subcommands/build-source', args),
        })
        .command({
            command: 'extension',
            describe: 'Builds the Openrunner WebExtension',
            builder: yargs =>
                yargs
                .group(['output'], 'Basic options')
                .option('output', {
                    alias: 'o',
                    describe: 'Where to place the generated Web Extension',
                    demandOption: true,
                })
                .option('xpi', {
                    alias: 'x',
                    describe: 'If set a single .xpi file is generated. If not set a directory is ' +
                              'generated which can be used with the "Load Temporary Add-on" button in firefox.',
                    boolean: true,
                })
                .group(['coverage', 'cncPort', 'tmp'], 'Advanced options')
                .option(...coverageOption)
                .option(...cncPortOption)
                .option(...tmpOption)
                .example('$0 build extension --xpi --output ./openrunner.xpi'),
            handler: args => executeCommandHandler('./_subcommands/build-extension', args),
        })
        .command({
            command: 'firefox-profile',
            describe: 'Builds a firefox profile directory, which can then be passed to firefox\' `--profile [directory]` ' +
                      'command line option. This profile includes the Openrunner WebExtension and various firefox preferences ' +
                      'that are useful for automated testing (for example: no auto updates, no first run hints, always open ' +
                      'popups in tabs, et cetera)',
            builder: yargs =>
                yargs
                .group(['output'], 'Basic options')
                .option('output', {
                    alias: 'o',
                    describe: 'Profile output directory',
                    demandOption: true,
                })
                .group(['coverage', 'cncPort', 'tmp'], 'Advanced options')
                .option(...coverageOption)
                .option(...cncPortOption)
                .option(...tmpOption)
                .example('$0 build firefox-profile --output ./firefox-profile')
                .example('\'/Applications/Firefox Nightly.app/Contents/MacOS/firefox\' --no-remote --profile ./firefox-profile'),
            handler: args => executeCommandHandler('./_subcommands/build-firefox-profile', args),
        })
        .command({
            command: 'firefox-mac-bundle',
            describe: 'Generate an application bundle for macOS containing firefox and the Openrunner WebExtension. ' +
                      'This bundle is then compressed into a disk image (.dmg). Launching this application is ' +
                      'enough to start using the Openrunner IDE without any dependencies. (this build command will only ' +
                      'function properly on macOS)',
            builder: yargs =>
                yargs
                .group(['profile', 'app', 'output'], 'Basic options')
                .option('profile', {
                    alias: 'p',
                    describe: 'Input directory containing a previously generated profile',
                    demandOption: false,
                })
                .option('app', {
                    alias: 'a',
                    describe: 'Input directory containing a firefox unbranded / nightly / developer edition macOS bundle',
                    demandOption: true,
                })
                .option('output', {
                    alias: 'o',
                    describe: 'Output file for the macOS application bundle',
                    demandOption: true,
                })
                .group(['tmp'], 'Advanced options')
                .option(...tmpOption)
                .example(
                    '$0 build firefox-mac-bundle --app /Volumes/Nightly/Nightly.app --output ./Openrunner.dmg',
                ),
            handler: args => executeCommandHandler('./_subcommands/build-firefox-mac-bundle', args),
        })
        .demandCommand(1, 'A subcommand must be provided'),
})
.command({
    command: 'result',
    describe: 'Various commands for interpreting result files',
    builder: yargs =>
        yargs
        .command({
            command: 'replay-log',
            describe: 'Replay the log messages from the specific result file',
            builder: yargs =>
                yargs
                .group(['result'], 'Basic options')
                .option('result', {
                    alias: 'r',
                    describe: 'Filesystem path where a JSON file containing the results of a script run will be read from',
                    demandOption: true,
                })
                .example('$0 result replay-log --result ./result.json'),
            handler: args => executeCommandHandler('./_subcommands/result-replay-log', args),
        })
        .demandCommand(1, 'A subcommand must be provided'),
})
.completion('completion')
.demandCommand(1, 'A command must be provided')
.strict(true)
.help('help')
.epilogue(
    'Options can also be set using environment variables by prefixing the option name with `OPENRUNNER_`. ' +
    'For example: `$0 ide --firefox /bin/firefox` and `OPENRUNNER_FIREFOX=/bin/firefox $0 ide` are equivalent.',
)
.argv;
