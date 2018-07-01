'use strict';
const {resolve: resolvePath, join: joinPath} = require('path');
const fs = require('fs-extra');
const {JSDOM} = require('jsdom');

const {checkOptionFileAccess, checkOptionIsDirectory} = require('../../lib/node/cli');
const {version} = require('../../package.json');

const {R_OK, X_OK} = fs.constants;
const appIcon = require.resolve('../../icons/openrunner.icns');
const bootstrapScript = `#!/usr/bin/env bash
MY_PATH="$( cd "$(dirname "$0")" ; pwd -P )"
"$MY_PATH/firefox" --no-remote --profile "$MY_PATH/../profile" "$@"
`;

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
        checkOptionIsDirectory(argv, 'profile'),
        checkOptionFileAccess(argv, 'profile', R_OK | X_OK),
        checkOptionIsDirectory(argv, 'app'),
        checkOptionFileAccess(argv, 'app', R_OK | X_OK),
    ]);

    if (!Math.min(...optionValidationResults)) {
        return 1;
    }

    const profilePath = resolvePath(argv.profile);
    const appPath = resolvePath(argv.app);
    const outputPath = resolvePath(argv.output);

    console.log(
        '*** Creating a new macOS application bundle with the profile',
        profilePath,
        'and firefox application bundle',
        appPath,
        'at',
        outputPath
    );

    await fs.copy(appPath, outputPath, {preserveTimestamps: true});
    await Promise.all([
        fs.copy(profilePath, joinPath(outputPath, 'Contents', 'profile'), {preserveTimestamps: true}),
        fs.copy(
            appIcon,
            joinPath(outputPath, 'Contents', 'Resources', 'openrunner.icns'),
            {preserveTimestamps: true}
        ),
        fs.writeFile(joinPath(outputPath, 'Contents', 'MacOS', 'openrunner'), bootstrapScript, {mode: 0o777}),
        modifyInfoPlist(joinPath(outputPath, 'Contents', 'Info.plist')),
    ]);

    console.log('*** Done!');
    return 0;
};

exports.handler = buildFirefoxMacBundleHandler;
