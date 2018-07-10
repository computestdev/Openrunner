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
    describe: 'Filesystem path to a directory to temporarily store files in, such as the profile used by the browser',
    default: tmpdir(),
}];

const headlessOption = ['headless', {
    alias: 'h',
    describe: 'Run the browser in headless mode. The browser is run as normal, minus any visible UI components visible',
    boolean: true,
}];

const profileCacheOption = ['profileCache', {
    describe: 'Filesystem path to a directory where the generated browser profile will be cached between multiple ' +
              'invocations of this command. If this option is not given, a new browser profile will be ' +
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

const executeCommandHandler = (modulePath, args) => {
    // We use a dynamic and lazy require here to prevent having to require the majority of the openrunner and
    // node_module source whenever we invoke something like `--help`, `--get-yargs-completions`, etc.
    const func = require(modulePath).handler;

    func(args).then(
        exitCode => {
            process.exitCode = exitCode;
        },
        err => {
            console.error('Error while executing command!');
            console.error(err, err.stack);
            process.exitCode = 99;
        }
    );
};

yargs
.wrap(yargs.terminalWidth())
.env('OPENRUNNER')
.command({
    command: 'ide',
    describe: 'Launch the Openrunner IDE',
    builder: yargs =>
        yargs
        .group(['firefox'], 'Basic options')
        .option(...firefoxOption)
        .group(['tmp'], 'Advanced options')
        .option(...tmpOption)
        .example('$0 ide --firefox \'/Applications/Firefox Nightly.app/Contents/MacOS/firefox\''),
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
        .group(['tmp', 'profileCache', 'cncPort'], 'Advanced options')
        .option(...tmpOption)
        .option(...profileCacheOption)
        .option('cncPort', {
            describe: 'The TCP port used to communicate with the browser. A web server will be started (temporarily) at this port ' +
            'on the loopback interface. If "0" is passed an unused port is picked by the OS however this can not ' +
            'be used at the same time as the --profileCache option',
            number: true,
            default: 17011,
        })
        .example(
            '$0 run --firefox \'/Applications/Firefox Nightly.app/Contents/MacOS/firefox\' ' +
            '--script example.js --result example.json'
        ),
    handler: args => executeCommandHandler('./_subcommands/run', args),
})
.command({
    command: 'build',
    describe: 'Various commands for building browser extensions and profiles',
    builder: yargs =>
        yargs
        // Building a profile takes two steps `build source` and `build firefox-profile`
        // This is because in the future we will have multiple build targets (`build chrome-profile`,
        // etc) which should all be build with identical sources. And it will speed up the entire build
        // process.
        .command({
            command: 'source',
            describe: 'Builds the Openrunner WebExtensions source, which can then be used to generate browser profiles',
            builder: yargs =>
                yargs
                .group(['output'], 'Basic options')
                .option(...buildOutputOption)
                .group(['coverage', 'cncPort'], 'Advanced options')
                .option(...coverageOption)
                .option('cncPort', {
                    describe:
                    'If set, the built extension will automatically try to connect to this WebSocket port on the loopback interface, ' +
                    'to receive JSON-RPC 2 calls',
                    number: true,
                    default: 0,
                    defaultDescription: 'disabled',
                })
                .example('$0 build source --output ./openrunner-extension'),
            handler: args => executeCommandHandler('./_subcommands/build-source', args),
        })
        .command({
            command: 'firefox-profile',
            describe: 'Builds a firefox profile directory, which can then be passed to firefox\' `--profile [directory]` ' +
                      'command line option. This profile includes the Openrunner WebExtension and various firefox preferences ' +
                      'that are useful for automated testing (for example: no auto updates, no first run hints, always open ' +
                      'popups in tabs, et cetera)',
            builder: yargs =>
                yargs
                .group(['input', 'output'], 'Basic options')
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
                .example('$0 build firefox-profile --input ./openrunner-extension --output ./firefox-profile')
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
                    demandOption: true,
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
                    '$0 build firefox-mac-bundle --profile ./firefox-profile --app ' +
                    '/Volumes/Nightly/Nightly.app --output ./Openrunner.dmg'
                ),
            handler: args => executeCommandHandler('./_subcommands/build-firefox-mac-bundle', args),
        })
        .demandCommand(1, 'A subcommand must be provided'),
})
.completion('completion')
.demandCommand(1, 'A command must be provided')
.strict(true)
.help('help')
.epilogue(
    'Options can also be set using environment variables by prefixing the option name with `OPENRUNNER_`. ' +
    'For example: `$0 ide --firefox /bin/firefox` and `OPENRUNNER_FIREFOX=/bin/firefox $0 ide` are equivalent.'
)
.argv;
