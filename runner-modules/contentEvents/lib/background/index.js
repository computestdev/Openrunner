'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/contentEvents-script-env.js');

module.exports = async script => {
    await script.include('runResult'); // required by content

    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('contentEvents', '/build/contentEvents-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
