'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const Promise = require('bluebird');
const fs = require('fs-extra');
const browserify = require('browserify');
const browserifyBuiltins = require('browserify/lib/builtins');
const {assert} = require('chai');

const CoverageInstrumentationStream = require('./CoverageInstrumentationStream');

const ROOT_PATH = resolvePath(__dirname, '../');
const rootPath = path => resolvePath(ROOT_PATH, path);

const buildBundles = async (outputDirectoryPath, buildConfigPath, {instrumentCoverage}) => {
    const outputPath = path => resolvePath(outputDirectoryPath, path);
    const bundle = async (source, dest) => {
        const b = browserify(source, {
            builtins: Object.assign({}, browserifyBuiltins, {
                openRunnerBuildConfig: buildConfigPath,
            }),
        });

        if (instrumentCoverage) {
            b.transform(fileName => new CoverageInstrumentationStream({}, resolvePath(fileName)));
        }

        let browserifyBundle = (await Promise.fromCallback(cb => b.bundle(cb))).toString('utf8');
        browserifyBundle += 'null;\n'; // make sure browser.tabs.executeScript always returns `null`

        await fs.writeFile(outputPath(dest), browserifyBundle, 'utf8');
    };

    await Promise.all([
        bundle(rootPath('core/lib/background'), 'background.js'),
        bundle(rootPath('core/lib/script-env'), 'script-env.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad'), 'scratchpad-content-scratchpad.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad-breakdown'), 'scratchpad-content-breakdown.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad-result'), 'scratchpad-content-result.js'),
        bundle(rootPath('runner-modules/assert/lib/script-env'), 'assert-script-env.js'),
        bundle(rootPath('runner-modules/assert/lib/content'), 'assert-content.js'),
        bundle(rootPath('runner-modules/chai/lib/script-env'), 'chai-script-env.js'),
        bundle(rootPath('runner-modules/chai/lib/content'), 'chai-content.js'),
        bundle(rootPath('runner-modules/contentEvents/lib/script-env'), 'contentEvents-script-env.js'),
        bundle(rootPath('runner-modules/contentEvents/lib/content'), 'contentEvents-content.js'),
        bundle(rootPath('runner-modules/eventSimulation/lib/script-env'), 'eventSimulation-script-env.js'),
        bundle(rootPath('runner-modules/eventSimulation/lib/content'), 'eventSimulation-content.js'),
        bundle(rootPath('runner-modules/expect/lib/script-env'), 'expect-script-env.js'),
        bundle(rootPath('runner-modules/expect/lib/content'), 'expect-content.js'),
        bundle(rootPath('runner-modules/httpEvents/lib/script-env'), 'httpEvents-script-env.js'),
        bundle(rootPath('runner-modules/requestBlocking/lib/script-env'), 'requestBlocking-script-env.js'),
        bundle(rootPath('runner-modules/requestModification/lib/script-env'), 'requestModification-script-env.js'),
        bundle(rootPath('runner-modules/runResult/lib/script-env'), 'runResult-script-env.js'),
        bundle(rootPath('runner-modules/runResult/lib/content'), 'runResult-content.js'),
        bundle(rootPath('runner-modules/screenshot/lib/script-env'), 'screenshot-script-env.js'),
        bundle(rootPath('runner-modules/tabs/lib/script-env'), 'tabs-script-env.js'),
        bundle(rootPath('runner-modules/tabs/lib/content'), 'tabs-content.js'),
        bundle(rootPath('runner-modules/wait/lib/script-env'), 'wait-script-env.js'),
        bundle(rootPath('runner-modules/wait/lib/content'), 'wait-content.js'),
        fs.copy(require.resolve('react/umd/react.development.js'), outputPath('react.js')),
        fs.copy(require.resolve('react-dom/umd/react-dom.production.min.js'), outputPath('react-dom.js')),
        fs.copy(require.resolve('performr-runner-result-graph/bundle'), outputPath('performr-runner-result-graph.js')),
    ]);
};

const createBuildConfig = async (outputPath, {cncPort}) => {
    const config = {
        cncLoopbackPort: cncPort,
    };
    const dest = resolvePath(outputPath, 'buildConfig.json');
    await fs.writeJson(dest, config);
    return dest;
};

const buildSources = async ({outputPath, cncPort = 0, instrumentCoverage = false}) => {
    assert.isOk(outputPath, 'outputPath must be set to a valid directory path');
    assert.isNumber(cncPort, 'cncPort must be a number');
    assert.isBoolean(instrumentCoverage, 'instrumentCoverage must be a boolean');

    const resolvedOutputPath = resolvePath(outputPath);

    await fs.emptyDir(resolvedOutputPath);
    const buildConfigPath = await createBuildConfig(resolvedOutputPath, {cncPort});
    await buildBundles(resolvedOutputPath, buildConfigPath, {instrumentCoverage});
    return {outputPath: resolvedOutputPath};
};

module.exports = buildSources;
