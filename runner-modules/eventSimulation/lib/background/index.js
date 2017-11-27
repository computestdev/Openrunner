'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/eventSimulation-script-env.js');

module.exports = async script => {
    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('eventSimulation', '/build/eventSimulation-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
