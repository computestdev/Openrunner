'use strict';
const screenshotMethods = require('./screenshotMethods');
const takeScreenshot = require('./takeScreenshot');

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
            const event = await takeScreenshot(deps);
            event.setMetaData('causedByScriptError', true);
        }
    };

    script.on('core.runScriptResult', (wait, eventData) => wait(handleRunScriptResult(eventData)));

    script.importScripts(scriptEnvUrl);
};
