'use strict';
const {assert} = require('chai');

const scriptFrameCommands = require('./scriptFrameCommands');
const {mergeCoverageReports} = require('../../../../lib/mergeCoverage');

module.exports = (tabManager, frame) => {
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
        return await frame.waitForChildFrameToken(String(token)); // returns the frameId
    };

    const receivedFrameToken = async (token) => {
        frame.parentFrame.resolveChildFrameToken(token, frame);
    };

    const validateFrameId = frameId => {
        // only allowed to execute commands on child frames (not ancestors, children of children, etc)
        const childFrame = tab.getFrame(frameId);
        assert.isTrue(frame.isChild(childFrame), 'Invalid frameId');
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
        ['tabs.mainContentInit', () => tabManager.handleTabMainContentInitialized(browserTabId, browserFrameId)],
        ['tabs.contentInit', ({moduleName}) => tabManager.handleTabModuleInitialized(browserTabId, browserFrameId, moduleName)],
        ['core.submitCodeCoverage', submitCodeCoverage],
        ['tabs.waitForChildFrameToken', waitForChildFrameToken],
        ['tabs.receivedFrameToken', receivedFrameToken],
        ['tabs.frameRun', run],
        ['tabs.frameWait', wait],
        ['tabs.frameWaitForNewPage', waitForNewPage],
    ]);
};
