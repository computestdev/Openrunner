'use strict';

/**
 * All modules names must at least be a valid javascript identifier.
 * However we add further restrictions
 * @type {RegExp}
 */
const VALID_MODULE_NAME = /^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[a-zA-Z_$][0-9a-zA-Z_$]*$/; // eslint-disable-line max-len
class ModuleRegister {
    constructor() {
        this.registeredModules = new Map();
        this.registeredModuleWaits = new Map();
    }

    static isValidModuleName(moduleName) {
        return typeof moduleName === 'string' && VALID_MODULE_NAME.test(moduleName);
    }

    registerModule(moduleName, promise) {
        if (typeof moduleName !== 'string' || !ModuleRegister.isValidModuleName(moduleName)) {
            throw Error('registerModule(): Invalid `moduleName`');
        }

        if (this.registeredModules.has(moduleName)) {
            throw Error(`registerModule(): The runner module "${moduleName}" has already been registered`);
        }

        for (const resolve of (this.registeredModuleWaits.get(moduleName) || [])) {
            resolve();
        }

        this.registeredModules.set(moduleName, promise);
    }

    hasModule(moduleName) {
        return this.registeredModules.has(moduleName);
    }

    async waitForModuleRegistration(name) {
        if (!this.registeredModules.has(name)) {
            await new Promise(resolve => {
                const resolveList = this.registeredModuleWaits.get(name) || [];
                resolveList.push(resolve);
                this.registeredModuleWaits.set(name, resolveList);
            });
        }

        return await this.registeredModules.get(name);
    }

    async getAllModules() {
        const entries = [...this.registeredModules.entries()];
        const promises = entries.map(
            async entry => [entry[0], await entry[1]]
        );
        return new Map(await Promise.all(promises));
    }
}

module.exports = ModuleRegister;
