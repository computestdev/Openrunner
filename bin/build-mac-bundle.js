'use strict';
/* eslint-env node */
const {resolve: resolvePath, join: joinPath} = require('path');
const yargs = require('yargs');
const fs = require('fs-extra');
const {JSDOM} = require('jsdom');

const {version} = require('../package.json');

const {argv} = (
    yargs
    .option('profile', {
        alias: 'p',
        describe: 'Input directory containing a previously generated profile',
        demandOption: true,
    })
    .option('app', {
        alias: 'a',
        describe: 'Input directory containing a firefox nightly / developer edition macOS bundle',
        demandOption: true,
        default: '/Applications/FirefoxDeveloperEdition.app',
    })
    .option('output', {
        alias: 'o',
        describe: 'Output directory for the macOS application bundle',
        demandOption: true,
    })
    .help('help')
);
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

(async () => {
    try {
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
                require.resolve('../icons/openrunner.icns'),
                joinPath(outputPath, 'Contents', 'Resources', 'openrunner.icns'),
                {preserveTimestamps: true}
            ),
            fs.writeFile(joinPath(outputPath, 'Contents', 'MacOS', 'openrunner'), bootstrapScript, {mode: 0o777}),
            modifyInfoPlist(joinPath(outputPath, 'Contents', 'Info.plist')),
        ]);

        console.log('*** Done!');
    }
    catch (err) {
        console.error('Error during build!', err);
        process.exitCode = 1;
    }
})();
