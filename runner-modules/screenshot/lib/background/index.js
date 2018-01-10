'use strict';
const screenshotMethods = require('./screenshotMethods');
const takeScreenshot = require('./takeScreenshot');
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'screenshot/background/index'});

const scriptEnvUrl = browser.extension.getURL('/build/screenshot-script-env.js');

module.exports = async script => {
    const tabs = await script.include('tabs');
    const runResult = await script.include('runResult');
    const deps = {
        browserTabs: browser.tabs,
        runResultModule: runResult,
        tabsModule: tabs,
    };

    script.rpcRegisterMethods(screenshotMethods(deps));

    const handleRunScriptResult = async ({scriptError}) => {
        if (scriptError) {
            try {
                const event = await takeScreenshot(deps);
                event.setMetaData('causedByScriptError', true);
                event.shortTitle = 'Screenshot (script error)';
                event.longTitle = `Screenshot (script error): ${scriptError.message}`;
            }
            catch (err) {
                log.warn({err}, 'Failed to take implicit screenshot triggered by a script error');
            }
        }
    };

    script.on('core.runScriptResult', (wait, eventData) => wait(handleRunScriptResult(eventData)));

    script.importScripts(scriptEnvUrl);
};
