'use strict';
const {illegalArgumentError} = require('../../../../lib/scriptErrors');

const validateTabId = (method, tabManager, tabId) => {
    if (typeof tabId !== 'string' || !tabManager.hasTab(tabId)) {
        throw illegalArgumentError(`tabs.${method}(): invalid argument \`tabId\``);
    }
};

const validateFrameId = (method, tabManager, tabId, frameId) => {
    if (typeof frameId !== 'number' ||
        frameId < 0 ||
        !Number.isFinite(frameId) ||
        !tabManager.getTab(tabId).frameByBrowserId(frameId)
    ) {
        throw illegalArgumentError(`tabs.${method}(): invalid argument \`frameId\` (${tabId} : ${frameId})`);
    }
};

const run = async ({tabManager, tabId, frameId, code, arg}) => {
    validateTabId('run', tabManager, tabId);
    validateFrameId('run', tabManager, tabId, frameId);
    if (typeof code !== 'string') {
        throw illegalArgumentError('tabs.run(): invalid argument `code`');
    }

    return await tabManager.runContentScript({
        id: tabId,
        browserFrameId:
        frameId,
        code,
        arg,
        retryCount: 1,
    });
};

const waitForNewPage = async ({tabManager, tabId, frameId, code, arg, timeoutMs}) => {
    validateTabId('waitForNewPage', tabManager, tabId);
    validateFrameId('waitForNewPage', tabManager, tabId, frameId);
    if (typeof code !== 'string') {
        throw illegalArgumentError('tabs.waitForNewPage(): invalid argument `code`');
    }

    return await tabManager.runContentScript({
        id: tabId,
        browserFrameId:
        frameId,
        code,
        arg,
        retryCount: 1,
        waitForNewPage: true,
        waitForNewPageTimeoutMs: timeoutMs,
    });
};

const wait = async ({tabManager, tabId, frameId, code, arg}) => {
    validateTabId('wait', tabManager, tabId);
    validateFrameId('wait', tabManager, tabId, frameId);
    if (typeof code !== 'string') {
        throw illegalArgumentError('tabs.wait(): invalid argument `code`');
    }

    return await tabManager.runContentScript({
        id: tabId,
        browserFrameId:
        frameId,
        code,
        arg,
        metadata: {
            waitBeginTime: Date.now(),
        },
        retryCount: 100,
    });
};

module.exports = {run, waitForNewPage, wait};
