'use strict';
const requestBlockingMethods = require('./requestBlockingMethods');
const BlockingPatterns = require('./BlockingPatterns');

const scriptEnvUrl = browser.extension.getURL('/build/requestBlocking-script-env.js');

module.exports = async script => {
    const tabs = await script.include('tabs');
    const browserWindowId = await tabs.getScriptBrowserWindowId();
    const blockingPatterns = new BlockingPatterns({
        browserWebRequest: browser.webRequest,
        browserWindowId,
    });

    const handleRunEnd = async () => {
        blockingPatterns.removeAll();
    };

    script.rpcRegisterMethods(requestBlockingMethods({blockingPatterns}));
    script.on('core.runEnd', wait => wait(handleRunEnd()));
    script.importScripts(scriptEnvUrl);
};
