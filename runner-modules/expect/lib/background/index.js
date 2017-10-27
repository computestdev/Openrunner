'use strict';

const scriptEnvUrl = browser.extension.getURL('/build/expect-script-env.js');

module.exports = async script => {
    await script.include('chai');

    const handleTabsInitializingTabContent = ({executeContentScript}) => {
        executeContentScript('expect', '/build/expect-content.js');
    };
    script.on('tabs.initializingTabContent', handleTabsInitializingTabContent);
    script.importScripts(scriptEnvUrl);
};
