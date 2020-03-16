/* global process */
'use strict';
const Promise = require('bluebird');
const fs = require('fs-extra');
const path = require('path');

const Process = require('./Process');
const log = require('../logger')({MODULE: 'node/firefoxProcess'});
const findFreeTCPPort = require('./findFreeTCPPort');
const FirefoxDebuggingClient = require('./FirefoxDebuggingClient');

const isWindows = process.platform === 'win32';

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

const startFirefox = ({firefoxPath, profilePath, headless = false, debugging = false, extraArgs = []}) => Promise.try(async () => {
    log.debug({firefoxPath, profilePath}, 'Starting firefox...');
    let fullFirefoxPath = firefoxPath;

    if (path.extname(firefoxPath) === '.app') {
        const firefoxStat = await fs.stat(firefoxPath);
        fullFirefoxPath = firefoxPath;
        if (firefoxStat.isDirectory()) {
            fullFirefoxPath = path.join(firefoxPath, 'Contents', 'MacOS', 'firefox-bin');
        }
    }

    // note: avoid using flags with two dashes (--foo vs -foo), they only work on linux
    // and macos. One dash works everywhere including windows.
    const args = [
        '-no-remote',
        '-profile',
        profilePath,
    ];

    if (isWindows) {
        // With firefox for windows, the process that we start is a special launcher process,
        // which starts firefox again and immediately exits:
        // https://wiki.mozilla.org/Platform/Integration/InjectEject/Launcher_Process/
        // So we pass -wait-for-browser to make sure that this process does not exit.
        // However killing this process does not kill the other firefox process(es),
        // we do not know the pid of these other processes here. So on windows we have
        // to use taskkill.exe to stop firefox, this is the effect of the `killTree`
        // option in the Process constructor.
        // The cleanest thing to do would be to use a WinAPI JobObject, however this
        // would require a native module for node.js (e.g. node-ffi).
        // Another alternative would be to request for 'listProcesses' using the debugging
        // protocol. Which gives us PID's, although it looks like that the main process PID
        // is missing.
        args.push('-wait-for-browser');
    }

    if (headless) {
        args.push('-headless');
    }

    let debuggingPort;
    if (debugging) {
        debuggingPort = await findFreeTCPPort();
        args.push('-start-debugger-server');
        args.push(debuggingPort.toString(10));
    }

    args.push(...extraArgs);

    const firefoxProcess = new Process({
        executablePath: fullFirefoxPath,
        args,
        outputFilter,
        killTree: isWindows,
    });
    await firefoxProcess.start();
    let debuggingClient;

    if (debugging) {
        debuggingClient = new FirefoxDebuggingClient(debuggingPort);
        await debuggingClient.start();
    }

    return {firefoxProcess, debuggingClient};
})
.disposer(async ({firefoxProcess, debuggingClient}) => {
    log.debug({firefoxPath, profilePath}, 'Stopping firefox...');
    try {
        if (debuggingClient) {
            await debuggingClient.stop();
        }
    }
    finally {
        await firefoxProcess.stop();
    }
    log.debug({firefoxPath, profilePath}, 'Stopped firefox');
});

module.exports = {startFirefox};
