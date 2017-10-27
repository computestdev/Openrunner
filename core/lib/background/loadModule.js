'use strict';
const builtinModules = require('../../../runner-modules/background-manifest');

const loadModule = async (script, moduleName) => {
    if (!builtinModules.has(moduleName)) {
        throw Error(`Unknown runner-module "${moduleName}"`);
    }
    const construct = builtinModules.get(moduleName);
    return await construct(script);
};

module.exports = loadModule;
