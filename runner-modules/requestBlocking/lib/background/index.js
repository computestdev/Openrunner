'use strict';
const requestBlockingMethods = require('./requestBlockingMethods');
const RequestModificationPatterns = require('../../../../lib/RequestModificationPatterns');

const scriptEnvUrl = browser.extension.getURL('/build/requestBlocking-script-env.js');

module.exports = async script => {
    const tabs = await script.include('tabs');
    const browserWindowId = await tabs.getScriptBrowserWindowId();
    const blockingPatterns = new RequestModificationPatterns({
        browserWebRequestEmitter: browser.webRequest.onBeforeRequest,
        extraInfoSpec: ['blocking'],
        browserWindowId,
        listener: () => ({cancel: true}),
    });

    const handleRunEnd = async () => {
        blockingPatterns.removeAll();
    };

    script.rpcRegisterMethods(requestBlockingMethods({blockingPatterns}));
    script.on('core.runEnd', wait => wait(handleRunEnd()));
    script.importScripts(scriptEnvUrl);
};
