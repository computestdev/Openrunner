'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/chai-script-env.js');

module.exports = async script => {
    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('chai', '/build/chai-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
