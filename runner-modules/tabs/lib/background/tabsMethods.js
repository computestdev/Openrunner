'use strict';
const {illegalArgumentError, newPageWaitTimeoutError, CONTENT_SCRIPT_ABORTED_ERROR} = require('../../../../lib/scriptErrors');
const delay = require('../../../../lib/delay');

const ALLOWED_URL_REGEXP = /^https?:\/\//;

module.exports = (tabManager) => {
    const createTab = async () => {
        // creating a tab has a lot of overhead, so we do not allow the runner script to pass an url here (the url is always about:blank)
        // this lets us create tabs outside of the transaction block, while the navigation is within the block
        const tab = await tabManager.createTab();
        return tab.id;
    };

    const setViewportSize = async ({width: viewportWidth, height: viewportHeight}) => {
        if (typeof viewportWidth !== 'number' || !Number.isSafeInteger(viewportWidth) || viewportWidth < 1 || viewportWidth > 7680) {
            throw illegalArgumentError('tabs.viewportSize(): invalid argument `width`');
        }

        if (typeof viewportHeight !== 'number' || !Number.isSafeInteger(viewportHeight) || viewportHeight < 1 || viewportHeight > 4320) {
            throw illegalArgumentError('tabs.viewPortSize(): invalid argument `height`');
        }

        const {windowSizeMinusViewport} = tabManager;
        const width = viewportWidth + windowSizeMinusViewport.width;
        const height = viewportHeight + windowSizeMinusViewport.height;
        const {width: resultWidth, height: resultHeight} = await tabManager.setWindowSize({width, height});

        if (width !== resultWidth || height !== resultHeight) {
            throw illegalArgumentError(
                `tabs.viewportSize: Failed to set the viewport size to ${viewportWidth}x${viewportHeight}. ` +
                `After resizing the window to ${width}x${height}, the actual size is ${resultWidth}x${resultHeight}. ` +
                'The given size is probably too small, or too large for the screen.'
            );
        }
    };

    const navigateTab = async ({id, url}) => {
        if (typeof id !== 'string' || !tabManager.hasTab(id)) {
            throw illegalArgumentError('tabs.navigate(): invalid argument `id`');
        }
        if (typeof url !== 'string' || !ALLOWED_URL_REGEXP.test(url)) {
            throw illegalArgumentError('tabs.navigate(): `url` argument must be an absolute HTTP URL');
        }

        return await tabManager.navigateTab(id, url);
    };

    const run = async ({id, code, arg}) => {
        if (typeof id !== 'string' || !tabManager.hasTab(id)) {
            throw illegalArgumentError('tabs.run(): invalid argument `id`');
        }

        if (typeof code !== 'string') {
            throw illegalArgumentError('tabs.run(): invalid argument `code`');
        }

        const metadata = Object.freeze({
            runBeginTime: Date.now(),
        });

        return await tabManager.runContentScript(id, tabManager.TOP_FRAME_ID, code, {arg, metadata});
    };

    const waitForNewPage = async ({id, code, arg, timeoutMs}) => {
        if (typeof id !== 'string' || !tabManager.hasTab(id)) {
            throw illegalArgumentError('tabs.run(): invalid argument `id`');
        }

        if (typeof code !== 'string') {
            throw illegalArgumentError('tabs.run(): invalid argument `code`');
        }

        const metadata = Object.freeze({
            runBeginTime: Date.now(),
        });

        const waitForNewContentPromise = tabManager.waitForNewContent(id, tabManager.TOP_FRAME_ID);
        try {
            const {reject} = await tabManager.runContentScript(id, tabManager.TOP_FRAME_ID, code, {arg, metadata});
            // do not return `resolve` to avoid timing inconsistencies (e.g. the script may have been canceled because of the navigation)
            if (reject) {
                return {reject};
            }
        }
        catch (err) {
            // ignore errors which are caused by navigation away; that is what we are expecting
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

    const wait = async ({id, code, arg}) => {
        if (typeof id !== 'string' || !tabManager.hasTab(id)) {
            throw illegalArgumentError('tabs.wait(): invalid argument `id`');
        }

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
                return await tabManager.runContentScript(id, tabManager.TOP_FRAME_ID, code, {arg, metadata});
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

    return new Map([
        ['tabs.create', createTab],
        ['tabs.setViewportSize', setViewportSize],
        ['tabs.navigate', navigateTab],
        ['tabs.run', run],
        ['tabs.wait', wait],
        ['tabs.waitForNewPage', waitForNewPage],
    ]);
};
