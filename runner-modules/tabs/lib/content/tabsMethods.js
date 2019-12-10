'use strict';
const {illegalArgumentError} = require('../../../../lib/scriptErrors');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/tabsMethods'});
const constructGlobalFunctions = require('./globalFunctions');
const sanitizeForJsonSerialization = require('../../../../lib/sanitizeForJsonSerialization');

// "not being evaluated by a direct call": http://www.ecma-international.org/ecma-262/5.1/#sec-10.4.
const evalNoScope = eval; // eslint-disable-line no-eval

const getModuleValues = function* (modulesMap, metadata) {
    for (const module of modulesMap.values()) {
        if (module && typeof module.scriptValue === 'function') {
            yield module.scriptValue(metadata);
        }
        else {
            yield module;
        }
    }
};


module.exports = (moduleRegister, eventEmitter, getScriptApiVersion) => {
    const getModule = name => moduleRegister.waitForModuleRegistration(name);
    const globalFunctionsPromise = constructGlobalFunctions(getModule);

    const compileFunction = async (functionCode, globalFunctions, metadataArg) => {
        const metadata = {
            ...metadataArg,
            scriptApiVersion: getScriptApiVersion(),
        };
        const modules = await moduleRegister.getAllModules();
        const argNames = [
            'runMetadata',
            'transaction',
            'log',
            ...modules.keys(),
        ];
        const argValues = [
            metadata, // `runMetadata`
            globalFunctions.transaction, // `transaction`
            globalFunctions.log, // `log`
            ...getModuleValues(modules, metadata),
        ];

        // (([foo, bar]) => (async () => { console.log('hi!') }))
        return evalNoScope(
            `(([${argNames.join(',')}]) => (${functionCode}))`,
        )(argValues);
    };

    const initializedTabContent = async () => {
        log.debug('initializedTabContent');
        eventEmitter.emit('tabs.initializedTabContent');
    };

    const run = async ({code, arg, metadata}) => {
        if (typeof code !== 'string') {
            throw illegalArgumentError('tabs.run(): invalid argument `code`');
        }

        if (typeof metadata !== 'object') {
            throw illegalArgumentError('tabs.run(): invalid argument `metadata`');
        }

        const globalFunctions = await globalFunctionsPromise;
        const func = await compileFunction(code, globalFunctions, metadata);

        try {
            const resolve = await func(arg);
            return {
                resolve: sanitizeForJsonSerialization(resolve, '[INVALID RETURN VALUE FROM CONTENT SCRIPT]'),
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

    const childFrameInitialized = ({browserFrameId}) => {
        log.debug({browserFrameId}, 'childFrameInitialized');
        eventEmitter.emit('tabs.childFrameInitialized', {browserFrameId});
    };

    return new Map([
        ['tabs.initializedTabContent', initializedTabContent],
        ['tabs.run', run],
        ['tabs.childFrameInitialized', childFrameInitialized],
    ]);
};
