'use strict';
/* global window:false */
const EventEmitter = require('events').EventEmitter;

const ContentRPC = require('../../../../lib/ContentRPC');
const tabsMethods = require('./tabsMethods');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/index'});
const contentUnloadEvent = require('./contentUnloadEvent');
const ModuleRegister = require('../../../../lib/ModuleRegister');

log.debug('Initializing...');

try {
    if (window.openRunnerRegisterRunnerModule) {
        throw Error('This tab has already had its content initialized!');
    }

    const moduleRegister = new ModuleRegister();
    // getModule is similar to include() in the other scopes, however it only supports modules which have already
    // been loaded (or are in the progress of loading)
    const getModule = name => moduleRegister.waitForModuleRegistration(name);
    const eventEmitter = new EventEmitter();
    const fireContentUnload = contentUnloadEvent(eventEmitter);
    const rpc = new ContentRPC({
        browserRuntime: browser.runtime,
        context: 'runner-modules/tabs',
    });
    rpc.attach();
    rpc.methods(tabsMethods(moduleRegister, eventEmitter));
    rpc.method('tabs.contentUnload', fireContentUnload);
    window.addEventListener('unload', fireContentUnload);
    eventEmitter.on('tabs.contentUnload', () => log.debug('Content is about to unload'));

    eventEmitter.on('tabs.contentUnload', () => {
        // eslint-disable-next-line camelcase, no-undef
        const myCoverage = typeof __runner_coverage__ === 'object' && __runner_coverage__;
        if (myCoverage) {
            rpc.notify('core.submitCodeCoverage', myCoverage);
        }
    });

    window.openRunnerRegisterRunnerModule = async (moduleName, func) => {
        try {
            if (typeof func !== 'function') {
                throw Error('openRunnerRegisterRunnerModule(): Invalid `func`');
            }

            const initModule = async () => {
                return await func({eventEmitter, getModule, rpc});
            };

            const promise = initModule();
            moduleRegister.registerModule(moduleName, promise);

            log.debug({moduleName}, 'Runner module has been initialized. Notifying the background script');
            await rpc.notify('tabs.contentInit', {moduleName});
        }
        catch (err) {
            log.error({err}, 'Error during openRunnerRegisterRunnerModule()');
            throw err;
        }
    };

    log.debug('Initialized... Notifying the background script');
    rpc.notify('tabs.mainContentInit')
    .catch(err => log.error({err}, 'Unable to send tabs.mainContentInit to the background script'));
}
catch (err) {
    log.error({err}, 'Error during initialization');
}
