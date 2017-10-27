'use strict';
/* eslint-env node */
const {resolve: resolvePath} = require('path');
const Promise = require('bluebird');
const fs = require('fs-extra');
const browserify = require('browserify');
const browserifyBuiltins = require('browserify/lib/builtins');
const {assert} = require('chai');

const ROOT_PATH = resolvePath(__dirname, '../');
const rootPath = path => resolvePath(ROOT_PATH, path);

const buildBundles = async (outputDirectoryPath, buildConfigPath) => {
    const outputPath = path => resolvePath(outputDirectoryPath, path);
    const bundle = async (source, dest) => {
        const b = browserify(source, {
            builtins: Object.assign({}, browserifyBuiltins, {
                openRunnerBuildConfig: buildConfigPath,
            }),
        });
        const browserifyBundle = await Promise.fromCallback(cb => b.bundle(cb));
        const bundle = Buffer.concat([
            browserifyBundle,
            Buffer.from('null;\n', 'utf8'), // make sure browser.tabs.executeScript always returns `null`
        ]);
        await fs.writeFile(outputPath(dest), bundle);
    };

    await Promise.all([
        bundle(rootPath('core/lib/background'), 'background.js'),
        bundle(rootPath('core/lib/script-env'), 'script-env.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad'), 'scratchpad-content-scratchpad.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad-breakdown'), 'scratchpad-content-breakdown.js'),
        bundle(rootPath('core/lib/scratchpad-content/scratchpad-result'), 'scratchpad-content-result.js'),
        bundle(rootPath('runner-modules/runResult/lib/script-env'), 'runResult-script-env.js'),
        bundle(rootPath('runner-modules/runResult/lib/content'), 'runResult-content.js'),
        bundle(rootPath('runner-modules/tabs/lib/script-env'), 'tabs-script-env.js'),
        bundle(rootPath('runner-modules/tabs/lib/content'), 'tabs-content.js'),
        fs.copy(require.resolve('react/dist/react.js'), outputPath('react.js')),
        fs.copy(require.resolve('react-dom/dist/react-dom.js'), outputPath('react-dom.js')),
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

const buildSources = async ({outputPath, cncPort = 0}) => {
    assert.isOk(outputPath, 'outputPath must be set to a valid directory path');
    assert.isNumber(cncPort, 'cncPort must be a number');

    const resolvedOutputPath = resolvePath(outputPath);

    await fs.emptyDir(resolvedOutputPath);
    const buildConfigPath = await createBuildConfig(resolvedOutputPath, {cncPort});
    await buildBundles(resolvedOutputPath, buildConfigPath);
    return {outputPath: resolvedOutputPath};
};

module.exports = buildSources;
