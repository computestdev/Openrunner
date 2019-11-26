'use strict';
const {assert} = require('chai');

const scriptFrameCommands = require('./scriptFrameCommands');
const {mergeCoverageReports} = require('../../../../lib/mergeCoverage');

module.exports = (tabManager, contentToken, frame) => {
    const {tab, browserFrameId} = frame;
    const {id: tabId, browserTabId} = tab;

    const submitCodeCoverage = contentCoverage => {
        // eslint-disable-next-line camelcase, no-undef
        const myCoverage = typeof __runner_coverage__ === 'object' && __runner_coverage__;
        if (myCoverage) {
            mergeCoverageReports(myCoverage, contentCoverage);
        }
    };

    const waitForChildFrameToken = async (token) => {
        const childBrowserFrameId = browserFrameId;
        const childFrame = await tabManager.frameWaitForChildFrameToken(browserTabId, childBrowserFrameId, String(token));
        return childFrame.browserFrameId;
    };

    const receivedFrameToken = async (token) => {
        const parentBrowserFrameId = frame.parentFrame.browserFrameId;
        const childBrowserFrameId = browserFrameId;
        tabManager.frameResolveChildFrameToken(browserTabId, parentBrowserFrameId, String(token), childBrowserFrameId);
    };

    const validateFrameId = frameId => {
        // only allowed to execute commands on child frames (not ancestors, children of children, etc)
        const childFrame = tab.frameByBrowserId(frameId);
        assert.isTrue(childFrame && childFrame.isChildOf(frame), 'Invalid frameId');
    };

    const run = async ({frameId, code, arg}) => {
        validateFrameId(frameId);
        return await scriptFrameCommands.run({tabManager, tabId, frameId, code, arg});
    };

    const waitForNewPage = async ({frameId, code, arg, timeoutMs}) => {
        validateFrameId(frameId);
        return await scriptFrameCommands.waitForNewPage({tabManager, tabId, frameId, code, arg, timeoutMs});
    };

    const wait = async ({frameId, code, arg}) => {
        validateFrameId(frameId);
        return await scriptFrameCommands.wait({tabManager, tabId, frameId, code, arg});
    };

    return new Map([
        [
            'tabs.mainContentInit',
            () => tabManager.handleTabMainContentInitialized(browserTabId, browserFrameId, contentToken),
        ],
        [
            'tabs.contentInit',
            ({moduleName}) => tabManager.handleTabModuleInitialized(browserTabId, browserFrameId, contentToken, moduleName),
        ],
        ['core.submitCodeCoverage', submitCodeCoverage],
        ['tabs.waitForChildFrameToken', waitForChildFrameToken],
        ['tabs.receivedFrameToken', receivedFrameToken],
        ['tabs.frameRun', run],
        ['tabs.frameWait', wait],
        ['tabs.frameWaitForNewPage', waitForNewPage],
    ]);
};
