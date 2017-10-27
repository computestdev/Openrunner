'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/wait-script-env.js');

module.exports = async script => {
    await script.include('runResult'); // required by content
    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('wait', '/build/wait-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
