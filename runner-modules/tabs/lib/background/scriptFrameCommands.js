'use strict';
const {illegalArgumentError, newPageWaitTimeoutError, CONTENT_SCRIPT_ABORTED_ERROR} = require('../../../../lib/scriptErrors');
const delay = require('../../../../lib/delay');

const validateTabId = (method, tabManager, tabId) => {
    if (typeof tabId !== 'string' || !tabManager.hasTab(tabId)) {
        throw illegalArgumentError(`tabs.${method}(): invalid argument \`tabId\``);
    }
};

const validateFrameId = (method, tabManager, tabId, frameId) => {
    if (typeof frameId !== 'number' ||
        frameId < 0 ||
        !Number.isFinite(frameId) ||
        !tabManager.getTab(tabId).hasFrame(frameId)
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

    const metadata = Object.freeze({
        runBeginTime: Date.now(),
    });

    return await tabManager.runContentScript(tabId, frameId, code, {arg, metadata});
};

const waitForNewPage = async ({tabManager, tabId, frameId, code, arg, timeoutMs}) => {
    validateTabId('waitForNewPage', tabManager, tabId);
    validateFrameId('waitForNewPage', tabManager, tabId, frameId);
    if (typeof code !== 'string') {
        throw illegalArgumentError('tabs.waitForNewPage(): invalid argument `code`');
    }

    const metadata = Object.freeze({
        runBeginTime: Date.now(),
    });

    const waitForNewContentPromise = tabManager.waitForNewContent(tabId, frameId);
    try {
        const {reject} = await tabManager.runContentScript(tabId, frameId, code, {arg, metadata});
        // do not return `resolve` to avoid timing inconsistencies (e.g. the script may have been canceled because of the navigation)
        if (reject) {
            return {reject};
        }
    }
    catch (err) {
        // ignore errors which are caused by navigating away; that is what we are expecting
        if (err.name !== CONTENT_SCRIPT_ABORTED_ERROR) {
            throw err;
        }
    }

    // the timeout does not start counting until the content script has completed its execution; this is by design
    await Promise.race([
        waitForNewContentPromise,
        delay(timeoutMs).then(() => Promise.reject(
            newPageWaitTimeoutError(`Waiting for a new page timed out after ${timeoutMs / 1000} seconds`)
        )),
    ]);

    return {reject: null};
};

const wait = async ({tabManager, tabId, frameId, code, arg}) => {
    validateTabId('wait', tabManager, tabId);
    validateFrameId('wait', tabManager, tabId, frameId);
    if (typeof code !== 'string') {
        throw illegalArgumentError('tabs.wait(): invalid argument `code`');
    }

    const waitMetadata = Object.freeze({
        waitBeginTime: Date.now(),
    });

    const attempt = async (attemptNumber) => {
        try {
            const metadata = Object.assign({
                attemptNumber,
                runBeginTime: Date.now(),
            }, waitMetadata);
            return await tabManager.runContentScript(tabId, frameId, code, {arg, metadata});
        }
        catch (err) {
            if (err.name === CONTENT_SCRIPT_ABORTED_ERROR) {
                // runContentScript wait for a new tab to initialize
                return await attempt(attemptNumber + 1);
            }

            throw err;
        }
    };

    return await attempt(0);
};

module.exports = {run, waitForNewPage, wait};
