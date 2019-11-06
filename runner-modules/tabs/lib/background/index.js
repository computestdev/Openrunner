'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/index'});
const TabManager = require('./TabManager');
const tabsMethods = require('./tabsMethods');

const scriptEnvUrl = browser.extension.getURL('/build/tabs-script-env.js');

module.exports = script => {
    const tabManager = new TabManager({
        scriptWindow: script.window,
        runtime: browser.runtime,
        tabs: browser.tabs,
        webNavigation: browser.webNavigation,
        scriptApiVersion: script.scriptApiVersion,
    });
    tabManager.on('tabCreated', data => script.emit('tabs.tabCreated', data));
    tabManager.on('initializedTabRpc', data => script.emit('tabs.initializedTabRpc', data));
    tabManager.on('initializingTabContent', data => script.emit('tabs.initializingTabContent', data));
    tabManager.on('initializedTabContent', data => script.emit('tabs.initializedTabContent', data));

    const handleRunEnd = async () => {
        log.info('Run has ended, closing all tabs');
        try {
            await tabManager.closeAllTabs();
        }
        finally {
            tabManager.detach();
        }
    };

    const getTab = tabId => tabManager.get(tabId);
    const getScriptBrowserWindowId = async () => tabManager.getBrowserWindowId();

    script.on('core.runEnd', wait => wait(handleRunEnd()));
    tabManager.attach();
    script.rpcRegisterMethods(tabsMethods(tabManager));
    script.importScripts(scriptEnvUrl);

    return Object.freeze({
        getTab,
        getScriptBrowserWindowId,
    });
};
