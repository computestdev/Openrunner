'use strict';
const Promise = require('bluebird');

const Process = require('./Process');
const log = require('../logger')({MODULE: 'node/firefoxProcess'});

const outputFilter = line => {
    // hide a lot of useless noise during test runs

    // Linux:
    // (firefox:6881): GLib-GObject-CRITICAL **: g_object_ref: assertion 'object->ref_count > 0' failed
    // (firefox:6881): GConf-WARNING **: Client failed to connect to the D-BUS daemon:
    // //bin/dbus-launch terminated abnormally without any error message

    // OS X:
    // 2017-01-01 12:34:56.789 plugin-container[17512:1629725] *** CFMessagePort: bootstrap_register(): failed 1100 (0x44c)
    //   'Permission denied', port = 0xb03f, name = 'com.apple.tsm.portname'
    // See /usr/include/servers/bootstrap_defs.h for the error codes.
    // Unable to read VR Path Registry from /Users/FOO/Library/Application Support/OpenVR/.openvr/openvrpaths.vrpath
    if (
        /^\(.*?firefox.*?\): (?:GLib-GObject-CRITICAL|GConf-WARNING) /.test(line) ||
        line === '//bin/dbus-launch terminated abnormally without any error message' ||
        /plugin-container.*?\*\*\* CFMessagePort: bootstrap_register\(\): failed 1100/.test(line) ||
        line === 'See /usr/include/servers/bootstrap_defs.h for the error codes.' ||
        /^Unable to read VR Path Registry from /.test(line)
    ) {
        return null; // skip the log line
    }

    return line;
};

const startFirefox = ({firefoxPath, profilePath, headless = false, extraArgs = []}) => Promise.try(async () => {
    log.debug({firefoxPath, profilePath}, 'Starting firefox...');
    const args = [
        '--no-remote',
        '--profile',
        profilePath,
        ...extraArgs,
    ];

    if (headless) {
        args.push('--headless');
    }

    const firefoxProcess = new Process({
        executablePath: firefoxPath,
        args,
        outputFilter,
    });
    await firefoxProcess.start();
    return firefoxProcess;
})
.disposer(async firefoxProcess => {
    log.debug({firefoxPath, profilePath}, 'Stopping firefox...');
    await firefoxProcess.stop();
});

module.exports = {startFirefox};
