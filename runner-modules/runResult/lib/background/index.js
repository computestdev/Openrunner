'use strict';

const TimePoint = require('../TimePoint');
const TimePeriod = require('../TimePeriod');
const Event = require('../Event');
const Transaction = require('../Transaction');
const RunResult = require('./RunResultBackground');
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'runResult/background/index'});

const scriptEnvUrl = browser.extension.getURL('/build/runResult-script-env.js');

TimePoint.setCounterFunc(() => ({
    backgroundCounter: performance.now(),
    scriptCounter: undefined,
    contentCounter: undefined,
}));

module.exports = script => {
    const handleTabsInitializedTabRpc = ({tab, rpc}) => {
        rpc.notification('runResult.scriptResult', result => {
            try {
                log.debug('Received script result object from content');
                for (const event of result.events) {
                    event.tabId = tab.id;
                    event.tabContentId = tab.currentContentId;
                }
                scriptResult.mergeJSONObject(result);
            }
            catch (err) {
                log.error({err}, 'Error during runResult.scriptResult notification');
            }
        });
    };

    const handleTabsInitializingTabContent = ({executeContentScript, rpc}) => {
        executeContentScript('runResult', '/build/runResult-content.js');
    };

    script.on('tabs.initializedTabRpc', handleTabsInitializedTabRpc);
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.rpcRegisterMethods(new Map([
        [
            'runResult.scriptResult',
            result => {
                try {
                    log.debug('Received script result object from script-env');
                    scriptResult.mergeJSONObject(result);
                }
                catch (err) {
                    log.error({err}, 'Error during runResult.scriptResult method');
                }
            },
        ],
    ]));
    script.importScripts(scriptEnvUrl);

    const scriptResult = new RunResult();

    return Object.freeze({
        TimePoint,
        TimePeriod,
        Event,
        Transaction,
        RunResult,
        scriptResult,
    });
};
