'use strict';
const requestModificationMethods = require('./requestModificationMethods');
const RequestModificationPatterns = require('../../../../lib/RequestModificationPatterns');
const applyModificationMap = require('../../../../lib/applyHeaderModificationMap');

const scriptEnvUrl = browser.extension.getURL('/build/requestModification-script-env.js');

module.exports = async script => {
    const tabs = await script.include('tabs');
    const browserWindowId = await tabs.getScriptBrowserWindowId();
    const requestHeaderPatterns = new RequestModificationPatterns({
        browserWebRequestEmitter: browser.webRequest.onBeforeSendHeaders,
        extraInfoSpec: ['blocking', 'requestHeaders'],
        browserWindowId,
        listener: (modificationMap, {requestHeaders}) => {
            return {
                requestHeaders: applyModificationMap(requestHeaders, modificationMap),
            };
        },
    });
    const responseHeaderPatterns = new RequestModificationPatterns({
        browserWebRequestEmitter: browser.webRequest.onHeadersReceived,
        extraInfoSpec: ['blocking', 'responseHeaders'],
        browserWindowId,
        listener: (modificationMap, {responseHeaders}) => {
            return {
                responseHeaders: applyModificationMap(responseHeaders, modificationMap),
            };
        },
    });

    const handleRunEnd = async () => {
        requestHeaderPatterns.removeAll();
        responseHeaderPatterns.removeAll();
    };

    script.rpcRegisterMethods(requestModificationMethods({requestHeaderPatterns, responseHeaderPatterns}));
    script.on('core.runEnd', wait => wait(handleRunEnd()));
    script.importScripts(scriptEnvUrl);
};
