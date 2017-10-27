'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/assert-script-env.js');

module.exports = async script => {
    await script.include('chai');

    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('assert', '/build/assert-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
