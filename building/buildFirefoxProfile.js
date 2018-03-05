'use strict';
/* eslint-env node */
const fs = require('fs-extra');
const {assert} = require('chai');
const {resolve: resolvePath, join: joinPath} = require('path');
const archiver = require('archiver');
const cjson = require('cjson');
const Promise = require('bluebird');

const {version: packageVersion} = require('../package.json');
const {temporaryDirectory} = require('../lib/node/temporaryFs');
const buildSources = require('./buildSources');
const log = require('../lib/logger')({MODULE: 'building/buildFirefoxProfile'});

const ROOT_PATH = resolvePath(__dirname, '../');
const rootPath = path => resolvePath(ROOT_PATH, path);
const EXTENSION_FILE_NAME = 'openrunner@computest.nl.xpi';
const ERROR_FAILED_TO_CREATE_PROFILE_CACHE = Symbol();

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

    const extensionFile = resolvePath(outputPath, 'extensions', EXTENSION_FILE_NAME);

    await Promise.all([
        buildFirefoxExtension({buildDir, extensionFile}),
        buildUserPrefFile({outputPath}),
    ]);
};

const buildSourcesAndFirefoxProfile = async ({sourcePath, cncPort, instrumentCoverage, profilePath}) => {
    log.debug({cncPort, sourcePath}, 'Building sources...');
    await buildSources({outputPath: sourcePath, cncPort, instrumentCoverage});

    log.debug({profilePath}, 'Building firefox profile...');
    await buildFirefoxProfile({sourceBuildInput: sourcePath, outputPath: profilePath});
};

const buildTempFirefoxProfile = ({tempDirectory, cncPort, instrumentCoverage}) => {
    const tempDirectoryDisposer = temporaryDirectory(tempDirectory, ['openrunner-src-', 'openrunner-profile-']);
    return Promise.try(async () => {
        const [sourcePath, profilePath] = await tempDirectoryDisposer.promise();
        await buildSourcesAndFirefoxProfile({sourcePath, cncPort, instrumentCoverage, profilePath});
        return profilePath;
    })
    .disposer(() => tempDirectoryDisposer.tryDispose());
};

const buildCachedTempFirefoxProfile = async ({tempDirectory, cncPort, instrumentCoverage, profileCache}) => {
    const profilePath = joinPath(profileCache, `firefox-${packageVersion}-${Number(cncPort)}`);

    // quick check to see if the profile looks valid
    if (await fs.pathExists(joinPath(profilePath, 'extensions', EXTENSION_FILE_NAME))) {
        log.debug({cncPort, profilePath}, 'Using cached profile');
        return profilePath;
    }

    await fs.mkdirp(profilePath).catch(err => {
        err[ERROR_FAILED_TO_CREATE_PROFILE_CACHE] = true;
        throw err;
    });

    await Promise.using(temporaryDirectory(tempDirectory, ['openrunner-src-']), async ([sourcePath]) => {
        await buildSourcesAndFirefoxProfile({sourcePath, cncPort, instrumentCoverage, profilePath});
    });

    return profilePath;
};

module.exports = {
    ERROR_FAILED_TO_CREATE_PROFILE_CACHE,
    EXTENSION_FILE_NAME,
    buildFirefoxProfile,
    buildSourcesAndFirefoxProfile,
    buildTempFirefoxProfile,
    buildCachedTempFirefoxProfile,
};
