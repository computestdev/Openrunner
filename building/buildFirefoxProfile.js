'use strict';
/* eslint-env node */
const fs = require('fs-extra');
const {assert} = require('chai');
const {resolve: resolvePath, join: joinPath} = require('path');
const archiver = require('archiver');
const cjson = require('cjson');
const Promise = require('bluebird');
const {tmpdir} = require('os');

const {version: packageVersion} = require('../package.json');
const {temporaryDirectory} = require('../lib/node/temporaryFs');
const buildSources = require('./buildSources');
const log = require('../lib/logger')({MODULE: 'building/buildFirefoxProfile'});

const ROOT_PATH = resolvePath(__dirname, '../');
const rootPath = path => resolvePath(ROOT_PATH, path);
const EXTENSION_FILE_NAME = 'openrunner@computest.nl.xpi';
const ERROR_FAILED_TO_CREATE_PROFILE_CACHE = Symbol();
const ERROR_FAILED_TO_CREATE_EXTENSION_CACHE = Symbol();

const buildFirefoxExtension  = async ({tempDirectory, outputPath, extensionOptions = {}, zipped}) => {
    let extensionZip;
    let extensionZipPromise;

    log.debug({outputPath, extensionOptions, zipped}, 'Building firefox extension...');

    if (zipped) {
        const extensionFileStream = fs.createWriteStream(outputPath);
        extensionZip = archiver('zip', {
            store: true, // no compression (for faster startup)
        });
        extensionZipPromise = new Promise((resolve, reject) => {
            extensionZip.on('warning', reject);
            extensionZip.on('error', reject);
            extensionFileStream.on('error', reject);
            extensionFileStream.on('finish', resolve);
        });
        extensionZip.pipe(extensionFileStream);
    }

    const addDirectory = async (source, dest) => {
        if (zipped) {
            extensionZip.directory(source, dest);
        }
        else {
            const destPath = joinPath(outputPath, dest);
            await fs.ensureDir(destPath);
            await fs.copy(source, destPath, {errorOnExist: true});
        }
    };

    const addFile = async (source, dest) => {
        if (zipped) {
            extensionZip.file(source, {name: dest});
        }
        else {
            await fs.copy(source, joinPath(outputPath, dest), {errorOnExist: true});
        }
    };

    await Promise.using(temporaryDirectory(tempDirectory || tmpdir(), ['openrunner-src-']), async ([sourcePath]) => {
        const addSources = async () => {
            const {cncPort, instrumentCoverage} = extensionOptions;
            await buildSources({outputPath: sourcePath, cncPort, instrumentCoverage});
            await addDirectory(sourcePath, 'build');
        };

        await Promise.all([
            addDirectory(rootPath('core'), 'core'),
            addDirectory(rootPath('icons'), 'icons'),
            addDirectory(rootPath('lib'), 'lib'),
            addDirectory(rootPath('runner-modules'), 'runner-modules'),
            addFile(rootPath('manifest.json'), 'manifest.json'),
            addDirectory(sourcePath, 'build'),
            addSources(),
        ]);

        if (zipped) {
            extensionZip.finalize();
            await extensionZipPromise;
        }
    });

    log.debug({outputPath, extensionOptions, zipped}, 'Firefox extension has been built!');
};

const buildUserPrefs =
    (preferences) => Object.entries(preferences)
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n') + '\n';

const buildUserPrefFile = async ({proxy = {}, outputPath}) => {
    const jsonString = await fs.readFile(require.resolve('./firefoxPreferences.json'), 'utf8');
    const preferences = cjson.parse(jsonString);

    // proxy configuration
    {
        const {http, https, exclude} = proxy;

        if (http || https) {
            preferences['network.proxy.type'] = 1;
            preferences['network.proxy.allow_hijacking_localhost'] = true;
        }

        if (http) {
            preferences['network.proxy.http'] = http.host;
            preferences['network.proxy.http_port'] = http.port;
        }

        if (https) {
            preferences['network.proxy.ssl'] = https.host;
            preferences['network.proxy.ssl_port'] = https.port;
        }

        if (exclude) {
            preferences['network.proxy.no_proxies_on'] = exclude.join(', ');
        }
    }

    const userFileContent = buildUserPrefs(preferences);
    await fs.writeFile(resolvePath(outputPath, 'user.js'), userFileContent);
};

const buildFirefoxProfile = async ({tempDirectory, preloadExtension, extensionOptions = {}, proxy = {}, outputPath}) => {
    assert.isOk(outputPath, 'outputPath must be set to a valid directory path');
    await fs.emptyDir(outputPath);

    log.debug({outputPath}, 'Building firefox profile...');

    let buildExtensionPromise;
    if (preloadExtension) {
        buildExtensionPromise =
            fs.emptyDir(resolvePath(outputPath, 'extensions'))
            .then(() => buildFirefoxExtension({
                tempDirectory,
                outputPath: resolvePath(outputPath, 'extensions', EXTENSION_FILE_NAME),
                extensionOptions,
                zipped: true,
            }));
    }

    await Promise.all([
        buildUserPrefFile({proxy, outputPath}),
        buildExtensionPromise,
    ]);

    log.debug({outputPath}, 'Firefox profile has been built!');
};

const buildTempFirefoxProfile = ({tempDirectory, preloadExtension, extensionOptions = {}, proxy = {}}) => {
    const tempDirectoryDisposer = temporaryDirectory(tempDirectory || tmpdir(), ['openrunner-profile-']);
    return Promise.try(async () => {
        const [profilePath] = await tempDirectoryDisposer.promise();
        await buildFirefoxProfile({tempDirectory, preloadExtension, extensionOptions, proxy, outputPath: profilePath});
        return profilePath;
    })
    .disposer(() => tempDirectoryDisposer.tryDispose());
};

const buildTempFirefoxExtensionDirectory = ({tempDirectory, extensionOptions = {}}) => {
    const tempDirectoryDisposer = temporaryDirectory(tempDirectory || tmpdir(), ['openrunner-extension-']);
    return Promise.try(async () => {
        const [extensionPath] = await tempDirectoryDisposer.promise();
        await buildFirefoxExtension({tempDirectory, extensionOptions, outputPath: extensionPath, zipped: false});
        return extensionPath;
    })
    .disposer(() => tempDirectoryDisposer.tryDispose());
};

const buildCachedFirefoxProfile = async ({tempDirectory, preloadExtension, extensionOptions = {}, buildCacheDirectory, proxy = {}}) => {
    const cacheName = preloadExtension
        ? `firefox-profile-${packageVersion}-y-${Number(extensionOptions.cncPort)}`
        : `firefox-profile-${packageVersion}-n`;

    const profilePath = joinPath(buildCacheDirectory, cacheName);

    // quick check to see if the profile looks valid
    const userJsValid = await fs.pathExists(joinPath(profilePath, 'user.js'));
    const preloadedExtensionValid = preloadExtension
        ? await fs.pathExists(joinPath(profilePath, 'extensions', EXTENSION_FILE_NAME))
        : true;

    if (userJsValid && preloadedExtensionValid) {
        log.debug({cncPort: preloadExtension && extensionOptions.cncPort, profilePath, preloadExtension}, 'Using cached profile');
        return profilePath;
    }

    await fs.mkdirp(profilePath).catch(err => {
        err[ERROR_FAILED_TO_CREATE_PROFILE_CACHE] = true;
        throw err;
    });

    await buildFirefoxProfile({tempDirectory, preloadExtension, extensionOptions, proxy, outputPath: profilePath});
    return profilePath;
};

const buildCachedFirefoxExtensionDirectory = async ({tempDirectory, extensionOptions = {}, buildCacheDirectory}) => {
    const cacheName = `firefox-extension-${packageVersion}-${Number(extensionOptions.cncPort)}`;
    const extensionPath = joinPath(buildCacheDirectory, cacheName);

    // quick check to see if the extension directory looks valid
    const manifestValid = await fs.pathExists(joinPath(extensionPath, 'manifest.json'));
    const buildConfigValid = await fs.pathExists(joinPath(extensionPath, 'build', 'buildConfig.json'));
    const scriptEnvValid = await fs.pathExists(joinPath(extensionPath, 'build', 'script-env.js'));

    if (manifestValid && buildConfigValid && scriptEnvValid) {
        log.debug({cncPort: extensionOptions.cncPort, extensionPath}, 'Using cached extension directory');
        return extensionPath;
    }

    await fs.mkdirp(extensionPath).catch(err => {
        err[ERROR_FAILED_TO_CREATE_EXTENSION_CACHE] = true;
        throw err;
    });

    await buildFirefoxExtension({tempDirectory, extensionOptions, outputPath: extensionPath, zipped: false});
    return extensionPath;
};

module.exports = {
    ERROR_FAILED_TO_CREATE_PROFILE_CACHE,
    ERROR_FAILED_TO_CREATE_EXTENSION_CACHE,
    EXTENSION_FILE_NAME,
    buildFirefoxExtension,
    buildUserPrefFile,
    buildFirefoxProfile,
    buildTempFirefoxProfile,
    buildTempFirefoxExtensionDirectory,
    buildCachedFirefoxProfile,
    buildCachedFirefoxExtensionDirectory,
};
