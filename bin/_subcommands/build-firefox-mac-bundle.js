'use strict';
const Promise = require('bluebird');
const {resolve: resolvePath, join: joinPath} = require('path');
const fs = require('fs-extra');
const {JSDOM} = require('jsdom');
const appdmg = require('appdmg');

const {checkOptionFileAccess, checkOptionIsDirectory} = require('../../lib/node/cli');
const {temporaryDirectory} = require('../../lib/node/temporaryFs');
const {buildTempFirefoxProfile} = require('../..');
const {version} = require('../../package.json');
const log = require('../../lib/logger')({MODULE: 'bin/openrunner'});

const {R_OK, X_OK, W_OK} = fs.constants;
const appIcon = require.resolve('../../icons/openrunner.icns');
const bootstrapScript = `#!/usr/bin/env bash
MY_PATH="$( cd "$(dirname "$0")" ; pwd -P )"
"$MY_PATH/firefox" --no-remote --profile "$MY_PATH/../profile" "$@"
`;
const PROJECT_PATH = joinPath(__dirname, '..', '..');

const modifyInfoPlist = async path => {
    const input = await fs.readFile(path, 'utf8');
    const dom = new JSDOM(input, {
        contentType: 'text/xml',
    });
    const {document} = dom.window;
    const findKeyElement = keyName => {
        return document.evaluate(`/plist/dict/key[text() = "${keyName}"]`, document, null, 9, null).singleNodeValue;
    };
    const valueElementForKey = keyName => {
        // note: injection in the xpath expression here. however we are only using this function by passing our own constant values
        const keyElement = findKeyElement(keyName);
        return keyElement.nextElementSibling;
    };
    const removeKey = keyName => {
        const keyElement = findKeyElement(keyName);
        const valueElement = keyElement.nextElementSibling;
        keyElement.remove();
        valueElement.remove();
    };

    const firefoxVersionElement = valueElementForKey('CFBundleShortVersionString');
    const firefoxVersion = firefoxVersionElement.textContent;
    valueElementForKey('CFBundleIdentifier').textContent = `nl.computest.openrunner`;
    valueElementForKey('CFBundleName').textContent = `Openrunner`;
    valueElementForKey('CFBundleGetInfoString').textContent = `Openrunner ${version} (F${firefoxVersion})`;
    valueElementForKey('CFBundleVersion').textContent = version;
    valueElementForKey('CFBundleExecutable').textContent = 'openrunner';
    valueElementForKey('CFBundleIconFile').textContent = `openrunner.icns`;
    removeKey('CFBundleSignature');

    const output = dom.serialize();
    await fs.writeFile(path, output);
};

const buildFirefoxMacBundleHandler = async argv => {
    const optionValidationResults = await Promise.all([
        argv.profile ? checkOptionIsDirectory(argv, 'profile') : true,
        argv.profile ? checkOptionFileAccess(argv, 'profile', R_OK | X_OK) : true,
        checkOptionIsDirectory(argv, 'app'),
        checkOptionFileAccess(argv, 'app', R_OK | X_OK),
        checkOptionIsDirectory(argv, 'tmp'),
        checkOptionFileAccess(argv, 'tmp', R_OK | W_OK | X_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const tempDirectory = resolvePath(argv.tmp);
    const appPath = resolvePath(argv.app);
    const outputDmgPath = resolvePath(argv.output);

    console.log(
        '*** Creating a new macOS application bundle in a .dmg with firefox application bundle',
        appPath,
        'at',
        outputDmgPath,
    );

    await Promise.using(
        temporaryDirectory(tempDirectory, ['openrunner-app-']),
        argv.profile
            ? resolvePath(argv.profile)
            : buildTempFirefoxProfile({tempDirectory, preloadExtension: true}),
        async ([tmp], profilePath) => {
            const appOutputPath = joinPath(tmp, 'Openrunner.app');
            await fs.copy(appPath, appOutputPath, {preserveTimestamps: true});
            await Promise.all([
                fs.copy(profilePath, joinPath(appOutputPath, 'Contents', 'profile'), {preserveTimestamps: true}),
                fs.copy(
                    appIcon,
                    joinPath(appOutputPath, 'Contents', 'Resources', 'openrunner.icns'),
                    {preserveTimestamps: true},
                ),
                fs.writeFile(joinPath(appOutputPath, 'Contents', 'MacOS', 'openrunner'), bootstrapScript, {mode: 0o777}),
                modifyInfoPlist(joinPath(appOutputPath, 'Contents', 'Info.plist')),
            ]);

            // make sure that we can overwrite any old .dmg file
            await fs.unlink(outputDmgPath).catch(err => (err.code === 'ENOENT' ? null : Promise.reject(err)));

            log.info({PROJECT_PATH, outputDmgPath}, 'Creating dmg...');
            const dmg = appdmg({
                target: outputDmgPath,
                basepath: PROJECT_PATH,
                specification: {
                    // Note: do not add spaces to the title! This is buggy in appdmg/ds-store
                    title: `Openrunner-v${version}`,
                    icon: 'icons/openrunner.icns',
                    background: 'building/openrunner-dmg-background.png',
                    'icon-size': 64,
                    window: {
                        size: {
                            width: 600,
                            height: 550,
                        },
                    },
                    format: 'UDBZ',
                    contents: [
                        {x: 450, y: 335, type: 'link', path: '/Applications'},
                        {x: 150, y: 335, type: 'file', path: appOutputPath},
                        {x: 2000, y: 0, type: 'position', path: '.VolumeIcon.icns'},
                        {x: 2000, y: 0, type: 'position', path: '.background'},
                    ],
                },
            });
            await new Promise((resolve, reject) => {
                dmg.on('error', reject);
                dmg.on('finish', resolve);
            });
        },
    );

    console.log('*** Done!');
    return 0;
};

exports.handler = buildFirefoxMacBundleHandler;
