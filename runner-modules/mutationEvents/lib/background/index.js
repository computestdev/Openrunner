'use strict';
const scriptEnvUrl = browser.extension.getURL('/build/mutationEvents-script-env.js');

module.exports = async script => {
    await script.include('runResult'); // required by content
    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('mutationEvents', '/build/mutationEvents-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
