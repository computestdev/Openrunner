'use strict';
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/tabsMethods'});
const constructGlobalFunctions = require('./globalFunctions');

// "not being evaluated by a direct call": http://www.ecma-international.org/ecma-262/5.1/#sec-10.4.
const evalNoScope = eval; // eslint-disable-line no-eval

module.exports = (moduleRegister, eventEmitter) => {
    const getModule = name => moduleRegister.waitForModuleRegistration(name);
    const globalFunctionsPromise = constructGlobalFunctions(getModule);

    const compileFunction = async (functionCode, globalFunctions, metadata) => {
        const modules = await moduleRegister.getAllModules();
        const argNames = ['runMetadata', 'transaction', ...modules.keys()];
        const argValues = [metadata, globalFunctions.transaction, ...modules.values()];

        // (([foo, bar]) => (async () => { console.log('hi!') }))
        return evalNoScope(
            `(([${argNames.join(',')}]) => (${functionCode}))`
        )(argValues);
    };

    const initializedTabContent = async () => {
        log.debug('initializedTabContent');
        eventEmitter.emit('tabs.initializedTabContent');
    };

    const run = async ({code, arg, metadata}) => {
        if (typeof code !== 'string') {
            throw Error('tabs.run(): invalid argument `code`');
        }

        if (typeof metadata !== 'object') {
            throw Error('tabs.run(): invalid argument `metadata`');
        }

        const globalFunctions = await globalFunctionsPromise;
        const func = await compileFunction(code, globalFunctions, metadata);

        try {
            const resolve = await func(arg);
            return {
                resolve,
                reject: null,
            };
        }
        catch (err) {
            log.debug({err}, 'Error during content script execution');
            return {
                resolve: undefined,
                reject: {
                    message: String(err.message),
                    name:    String(err.name),
                    stack:   String(err.stack),
                },
            };
        }
    };

    return new Map([
        ['tabs.initializedTabContent', initializedTabContent],
        ['tabs.run', run],
    ]);
};
