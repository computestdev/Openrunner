'use strict';
/* eslint-env node */
const fs = require('fs-extra');
const {assert} = require('chai');
const {resolve: resolvePath} = require('path');
const archiver = require('archiver');
const cjson = require('cjson');

const ROOT_PATH = resolvePath(__dirname, '../');
const rootPath = path => resolvePath(ROOT_PATH, path);

const buildFirefoxExtension  = async ({buildDir, extensionFile}) => {
    const extensionFileStream = fs.createWriteStream(extensionFile);
    const extensionZip = archiver('zip', {
        store: true, // no compression (for faster startup)
    });
    const extensionZipPromise = new Promise((resolve, reject) => {
        extensionZip.on('warning', reject);
        extensionZip.on('error', reject);
        extensionFileStream.on('error', reject);
        extensionFileStream.on('finish', resolve);
    });
    extensionZip.pipe(extensionFileStream);
    extensionZip.directory(rootPath('core'), 'core');
    extensionZip.directory(rootPath('icons'), 'icons');
    extensionZip.directory(rootPath('lib'), 'lib');
    extensionZip.directory(rootPath('runner-modules'), 'runner-modules');
    extensionZip.file(rootPath('manifest.json'), {name: 'manifest.json'});
    extensionZip.directory(buildDir, 'build');
    extensionZip.finalize();
    await extensionZipPromise;
};

const buildUserPrefs =
    (preferences) => Object.entries(preferences)
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n') + '\n';

const buildUserPrefFile = async ({outputPath}) => {
    const jsonString = await fs.readFile(require.resolve('./firefoxPreferences.json'), 'utf8');
    const preferences = cjson.parse(jsonString);
    const userFileContent = buildUserPrefs(preferences);
    await fs.writeFile(resolvePath(outputPath, 'user.js'), userFileContent);
};

const buildFirefoxProfile = async ({sourceBuildInput, outputPath}) => {
    assert.isOk(outputPath, 'outputPath must be set to a valid directory path');
    const buildDir = resolvePath(sourceBuildInput);

    await fs.emptyDir(outputPath);
    await fs.emptyDir(resolvePath(outputPath, 'extensions'));

    const extensionFile = resolvePath(outputPath, 'extensions', 'openrunner@computest.nl.xpi');

    await Promise.all([
        buildFirefoxExtension({buildDir, extensionFile}),
        buildUserPrefFile({outputPath}),
    ]);
};

module.exports = buildFirefoxProfile;
