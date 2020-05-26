'use strict';
const {assert} = require('chai');
const fs = require('fs-extra');
const Promise = require('bluebird');
const {resolve: resolvePath, join: joinPath, basename, dirname, extname} = require('path');
const {tmpdir} = require('os');

const {temporaryDirectory} = require('../lib/node/temporaryFs');
const hardLinkCopy = require('../lib/node/hardlinkCopy');

const buildFirefoxPolicies = async ({certificatePaths, outputPath}) => {
    const document = {
        policies: {
            Certificates: {},
        },
    };

    if (certificatePaths) {
        // https://github.com/mozilla/policy-templates/blob/master/README.md#certificates--install
        // paths to der or pem files.
        // a relative path will be searched for in predefined directories (such as /usr/lib/mozilla/certificates),
        // so we always pass an absolute path
        document.policies.Certificates.Install = certificatePaths.map(p => resolvePath(p));
    }

    await fs.writeFile(outputPath, JSON.stringify(document, null, 4), 'utf8');
};

const copyFirefox = async (options) => {
    const {fullFirefoxPath, policyOptions} = options;
    const binaryBaseName = basename(fullFirefoxPath);
    let {firefoxRootDestinationPath} = options;
    let firefoxRootDirectory = dirname(fullFirefoxPath);
    let isMacOs = false;

    if (basename(firefoxRootDirectory) === 'MacOS') {
        isMacOs = true;
        // convert something like "/foo/Firefox.app/Contents/MacOS/firefox-bin" to "/foo/Firefox.app"
        firefoxRootDirectory = dirname(firefoxRootDirectory);
        assert.strictEqual(basename(firefoxRootDirectory), 'Contents');
        firefoxRootDirectory = dirname(firefoxRootDirectory);
        assert.strictEqual(extname(firefoxRootDirectory), '.app');
        // macOS will complain if the application bundle does not end with ".app"
        firefoxRootDestinationPath = joinPath(firefoxRootDestinationPath, 'Firefox.app');
    }

    // Some sanity checks to avoid common misconfigurations
    {
        const sourceBaseName = basename(firefoxRootDirectory);
        switch (sourceBaseName) {
            case 'bin':
            case 'sbin':
            case 'home':
            case 'tmp':
                throw Error(
                    `The given path to the firefox binary does not look usable (${fullFirefoxPath}). ` +
                    `An optional feature has been configured, which requires Openrunner to copy the ` +
                    `entire firefox installation (${firefoxRootDirectory}), so that an enterprise ` +
                    `policy can be injected. However this has only been implemented for self contained ` +
                    `installations of firefox, not for installations installed by a package manager.`,
                );
        }
    }

    // on linux and windows the firefox binary is in the top directory, so `sourcePath` is already correct.
    await hardLinkCopy(firefoxRootDirectory, firefoxRootDestinationPath, {
        overwrite: true,
        dereference: false,
        preserveTimestamps: true,
    });

    if (policyOptions) {
        /*
         * Windows: c:\program files\mozilla firefox\distribution\policies.json
         * MacOS:   /Applications/Firefox.app/Contents/Resources/distribution/policies.json
         * Linux:   /opt/firefox/distribution/policies.json
         */

        const distributionPath = isMacOs
            ? joinPath(firefoxRootDestinationPath, 'Contents', 'Resources', 'distribution')
            : joinPath(firefoxRootDestinationPath, 'distribution');

        await fs.ensureDir(distributionPath);

        await buildFirefoxPolicies({
            ...policyOptions,
            outputPath: joinPath(distributionPath, 'policies.json'),
        });
    }

    const fullFirefoxDestinationPath = isMacOs
        ? joinPath(firefoxRootDestinationPath, 'Contents', 'MacOS', binaryBaseName)
        : joinPath(firefoxRootDestinationPath, binaryBaseName);

    return {firefoxRootDestinationPath, fullFirefoxDestinationPath};
};

const copyFirefoxToTemp = ({tempDirectory, fullFirefoxPath, policyOptions}) => {
    const tempDirectoryDisposer = temporaryDirectory(tempDirectory || tmpdir(), ['openrunner-firefox-']);
    return Promise.try(async () => {
        const [tempPath] = await tempDirectoryDisposer.promise();

        return await copyFirefox({
            fullFirefoxPath,
            firefoxRootDestinationPath: tempPath,
            policyOptions,
        });
    })
    .disposer(() => tempDirectoryDisposer.tryDispose());
};

module.exports = {buildFirefoxPolicies, copyFirefox, copyFirefoxToTemp};
