'use strict';
const ALLOWED_URL_REGEXP = /^https?:\/\//;
const {illegalArgumentError} = require('../../../../lib/scriptErrors');
const scriptFrameCommands = require('./scriptFrameCommands');

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
        return await scriptFrameCommands.run({tabManager, tabId: id, frameId: tabManager.TOP_FRAME_ID, code, arg});
    };

    const waitForNewPage = async ({id, code, arg, timeoutMs}) => {
        return await scriptFrameCommands.waitForNewPage({tabManager, tabId: id, frameId: tabManager.TOP_FRAME_ID, code, arg, timeoutMs});
    };

    const wait = async ({id, code, arg}) => {
        return await scriptFrameCommands.wait({tabManager, tabId: id, frameId: tabManager.TOP_FRAME_ID, code, arg});
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
