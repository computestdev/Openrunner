'use strict';
const EventEmitter = require('events').EventEmitter;
const {assert} = require('chai');

const delay = require('../../../../lib/delay');
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/TabManager'});
const {contentScriptAbortedError, newPageWaitTimeoutError} = require('../../../../lib/scriptErrors');
const {TabContentTracker} = require('../../../../lib/TabContentTracker');
const TabContentRPC = require('../../../../lib/contentRpc/TabContentRPC');
const {resolveScriptContentEvalStack} = require('../../../../lib/errorParsing');
const WaitForEvent = require('../../../../lib/WaitForEvent');
const contentMethods = require('./contentMethods');

const TOP_FRAME_ID = 0;

class TabManager extends EventEmitter {
    constructor({
        scriptWindow,
        runtime: browserRuntime,
        tabs: browserTabs,
        webNavigation: browserWebNavigation,
        scriptApiVersion,
    }) {
        super();
        this._attached = false;
        this.browserRuntime = browserRuntime;
        this.browserTabs = browserTabs;
        this.browserWebNavigation = browserWebNavigation;
        // all tabs opened by the script end up in a single window:
        this.scriptWindow = scriptWindow;
        this.tabTracker = new TabContentTracker();
        this.tabContentRPC = new TabContentRPC({
            browserRuntime,
            browserTabs,
            context: 'runner-modules/tabs',
            onRpcInitialize: obj => this.handleRpcInitialize(obj),
            filterSender: tab => Boolean(this.tabTracker.tabByBrowserId(tab.id)),
        });
        this.scriptApiVersion = scriptApiVersion;
        this._navigationCommittedWait = new WaitForEvent(); // key is [browserTabId, browserFrameId]

        this.handleTabCreated = this.handleTabCreated.bind(this);
        this.handleWebNavigationOnBeforeNavigate = this.handleWebNavigationOnBeforeNavigate.bind(this);
        this.handleWebNavigationOnCommitted = this.handleWebNavigationOnCommitted.bind(this);
        this.handleTabMainContentInitialized = this.handleTabMainContentInitialized.bind(this);
        this.handleTabsRemoved = this.handleTabsRemoved.bind(this);
        this.TOP_FRAME_ID = TOP_FRAME_ID;
        Object.seal(this);
    }

    attach() {
        this.tabContentRPC.attach();
        this.browserTabs.onCreated.addListener(this.handleTabCreated);
        this.browserWebNavigation.onBeforeNavigate.addListener(this.handleWebNavigationOnBeforeNavigate);
        this.browserWebNavigation.onCommitted.addListener(this.handleWebNavigationOnCommitted);
        this.browserTabs.onRemoved.addListener(this.handleTabsRemoved);
        this._attached = true;
    }

    detach() {
        this._attached = false;
        this.tabContentRPC.detach();
        this.browserTabs.onCreated.removeListener(this.handleTabCreated);
        this.browserWebNavigation.onBeforeNavigate.removeListener(this.handleWebNavigationOnBeforeNavigate);
        this.browserWebNavigation.onCommitted.removeListener(this.handleWebNavigationOnCommitted);
        this.browserTabs.onRemoved.removeListener(this.handleTabsRemoved);
    }

    async handleTabCreated(browserTab) {
        try {
            const {id: browserTabId} = browserTab;
            const tabIsInMyWindow = await this.scriptWindow.hasBrowserTab(browserTab);
            log.debug({browserTabId: browserTabId, tabIsInMyWindow}, 'browser.tabs.onCreated');

            // We could use `browserTab.openerTabId` to figure out if the tab was opened by us
            // however: https://bugzilla.mozilla.org/show_bug.cgi?id=1238314
            // So we set these preferences in the generated profile for now:
            //     browser.link.open_newwindow = 3
            //     browser.link.open_newwindow.restriction = 0
            if (!tabIsInMyWindow) {
                return;
            }

            if (!this.tabTracker.tabByBrowserId(browserTabId)) {
                const tab = this.tabTracker.tabCreated(browserTabId);
                this.emit('tabCreated', {tab});
            }
        }
        catch (err) {
            log.error({err}, 'Error in browser.tabs.onCreated');
        }
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        this.tabTracker.tabClosed(browserTabId);
    }

    async frameAncestorIds(tab, browserFrameId) {
        const {browserTabId} = tab;
        const result = [];
        for (let current = browserFrameId; current >= 0;) {
            result.push(current);

            if (current === 0) {
                break; // frame 0 never has a parent, we don't have to call getFrame() for it
            }

            const frame = tab.frameByBrowserId(browserFrameId);
            if (frame) {
                current = frame.parentBrowserFrameId;
            }
            else {
                // have not seen this frame before
                const result = await this.browserWebNavigation.getFrame({
                    tabId: browserTabId,
                    frameId: current,
                });
                current = result.parentFrameId; // might be -1, which means this is the top frame
            }
        }

        return result;
    }

    async handleRpcInitialize({browserTabId, browserFrameId, contentToken, rpc}) {
        const tab = this.tabTracker.tabByBrowserId(browserTabId);
        log.debug(
            {browserTabId, browserFrameId, contentToken, myTab: Boolean(tab)},
            'Received the first message from a new content instance',
        );

        if (!tab) {
            return; // not my tab
        }

        const browserFrameAncestorIds = await this.frameAncestorIds(tab, browserFrameId);
        const contentInstance = this.tabTracker.frameContentHello(browserTabId, browserFrameAncestorIds, contentToken);
        const {frame} = contentInstance;
        rpc.methods(contentMethods(this, contentToken, frame));
        this.emit('initializedTabRpc', {tab, frame, contentInstance, rpc});
    }

    handleWebNavigationOnBeforeNavigate({tabId: browserTabId, frameId: browserFrameId, url}) {
        try {
            log.debug({browserTabId, browserFrameId, url}, 'browser.webNavigation.onBeforeNavigate');
            this.tabTracker.frameBeforeNavigate(browserTabId, browserFrameId);
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onBeforeNavigate');
        }
    }

    handleWebNavigationOnCommitted({tabId: browserTabId, frameId: browserFrameId, url}) {
        try {
            log.debug({browserTabId, browserFrameId, url}, 'browser.webNavigation.onCommitted');
            this._navigationCommittedWait.resolve([browserTabId, browserFrameId], null);
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onCommitted');
        }
    }

    async handleTabMainContentInitialized(browserTabId, browserFrameId, contentToken) {
        const tab = this.tabTracker.tabByBrowserId(browserTabId);
        const isMyTab = Boolean(tab);

        if (!isMyTab) {
            log.info(
                {browserTabId, browserFrameId, contentToken, isMyTab},
                'handleTabMainContentInitialized for a different script or unknown tab',
            );
            return null; // the tab does not belong to this script
        }

        const rpc = this.tabContentRPC.get(browserTabId, browserFrameId, contentToken);
        const frame = tab.frameByBrowserId(browserFrameId);
        assert.isOk(frame, `Frame ${browserFrameId} has not been registered for tab ${browserTabId}`);

        const contentId = frame.currentContentId;
        log.info({browserTabId, browserFrameId, contentToken, contentId}, 'Main tab content script has been initialized');

        const files = [];
        const executeContentScript = (initToken, file) => {
            log.debug(
                {browserTabId, browserFrameId, contentToken, contentId, initToken, file},
                'Executing content script for runner module',
            );
            this.tabTracker.frameExpectInitialization(browserTabId, browserFrameId, contentToken, String(initToken));
            files.push(String(file));
        };

        this.emit('initializingTabContent', {tab, frame, executeContentScript, rpc});

        for (const file of files) {
            this.browserTabs.executeScript(browserTabId, {
                allFrames: false,
                frameId: browserFrameId,
                file,
                runAt: 'document_start',
            });
        }

        this.tabTracker.frameMainInitializationComplete(browserTabId, browserFrameId, contentToken);

        return {
            scriptApiVersion: this.scriptApiVersion,
            contentId,
        };
    }

    handleTabModuleInitialized(browserTabId, browserFrameId, contentToken, initToken) {
        const frame = this.tabTracker.frameByBrowserId(browserTabId, browserFrameId);
        assert.isOk(frame, 'frame');
        const {tab} = frame;
        const contentId = frame.currentContentId;

        const frameWasInitialized = frame.initialized;
        log.debug(
            {browserTabId, browserFrameId, contentToken, contentId, initToken, frameWasInitialized},
            'Module tab content script has been initialized',
        );
        const contentInstance = this.tabTracker.frameCompleteInitialization(browserTabId, browserFrameId, contentToken, initToken);
        const frameIsInitialized = frame.initialized;

        if (!frameWasInitialized && frameIsInitialized) {
            log.info({browserTabId, browserFrameId, contentToken, contentId}, 'All tab content scripts have initialized');
            this.emit('initializedTabContent', {tab, frame, contentInstance});

            const rpc = this.tabContentRPC.get(browserTabId, browserFrameId, contentToken);
            rpc.callAndForget('tabs.initializedTabContent');

            const {parentFrame} = frame;
            if (parentFrame) {
                const parentBrowserFrameId = parentFrame.browserFrameId;
                log.debug(
                    {browserTabId, contentId, browserFrameId, parentBrowserFrameId},
                    'Notifying parent frame that a child frame has been initialized',
                );

                // todo: it is possible that the child frame completed initialization, before the main content script for the parent frame
                //       is active yet. In this case the message would not arrive.

                // parent frame might not have been initialized yet, so send the message to all.
                for (const parentContentInstance of parentFrame.allContentInstances()) {
                    const {contentToken} = parentContentInstance;

                    const parentRpc = this.tabContentRPC.get(browserTabId, parentFrame.browserFrameId, contentToken);
                    parentRpc.callAndForget('tabs.childFrameInitialized', {browserFrameId});
                }
            }
        }
    }

    async createTab() {
        assert.isTrue(this._attached, 'TabManager#createTab: Not initialized yet or in the progress of cleaning up');
        // note: "about:blank" might cause our content scripts to not run, but that is okay: that will simply cause the tab to not be
        // marked as "initialized". runner scripts are expected to call tab.navigate(url) before interacting further with that tab
        const browserTab = await this.scriptWindow.createTab('about:blank');
        const {id: browserTabId} = browserTab;

        const tab = this.tabTracker.tabCreated(browserTabId);
        this.emit('tabCreated', {tab});
        return tab;
    }

    async frameWaitForChildFrameToken(browserTabId, parentBrowserFrameId, token) {
        return await this.tabTracker.frameWaitForChildFrameToken(browserTabId, parentBrowserFrameId, token);
    }

    /**
     * @param {number} browserTabId
     * @param {number} parentBrowserFrameId
     * @param {string} token
     * @param {number} childBrowserFrameId
     */
    frameResolveChildFrameToken(browserTabId, parentBrowserFrameId, token, childBrowserFrameId) {
        return this.tabTracker.frameResolveChildFrameToken(browserTabId, parentBrowserFrameId, token, childBrowserFrameId);
    }


    getTab(id) {
        return this.tabTracker.tabById(id);
    }

    hasTab(id) {
        return Boolean(this.getTab(id));
    }

    async navigateTab(id, url) {
        assert.isTrue(this._attached, 'TabManager#navigateTab: Not initialized yet or in the progress of cleaning up');

        const tab = this.getTab(id);
        const {browserTabId} = tab;

        // wait for the onCommitted event (which occurs even if there was an error downloading the page)
        // a new navigation might fail if onCommitted has not fired yet (firefox 57).
        await this._navigationCommittedWait.wait([browserTabId, TOP_FRAME_ID], async () => {
            const frame = tab.topFrame;
            const contentId = frame && frame.currentContentId;

            log.debug({browserTabId, TOP_FRAME_ID, contentId, url}, 'Navigating tab to new url');
            await this.browserTabs.update(browserTabId, {url});
            await this.tabTracker.whenInitialized(browserTabId, TOP_FRAME_ID, () => {});
        });
    }

    async runContentScript({
        id,
        browserFrameId,
        retryCount = 1,
        waitForNewPage = false,
        waitForNewPageTimeoutMs = 30000,
        code,
        arg,
        metadata = {},
    } = {}) {
        assert.isTrue(this._attached, 'TabManager#runContentScript: Not initialized yet or in the progress of cleaning up');
        const tab = this.getTab(id);
        assert.isOk(tab, 'tab');
        const {browserTabId} = tab;

        const logProps = {browserTabId, browserFrameId, codeLength: code.length, retryCount, waitForNewPage};
        log.debug(logProps, 'Running content script...');

        let waitForNewPagePromise = null;

        const callback = async ({contentInstance, attempt, attemptsLeft}) => {
            const {contentToken} = contentInstance;
            const rpc = this.tabContentRPC.get(browserTabId, browserFrameId, contentToken);

            log.debug(logProps, {attempt, attemptsLeft}, 'Frame initialized, attempting to send tabs.run RPC command...');
            if (waitForNewPage && !waitForNewPagePromise) {
                // Wait for the content to deinitialize and then initialize again.
                // it is important that this promise is created before actually sending the script to the
                // content, to avoid timing bugs.
                waitForNewPagePromise = this.tabTracker.whenInitialized(
                    browserTabId,
                    browserFrameId,
                    () => {},
                    {retryCount: 1, nextInitialization: true},
                );
            }

            // This data is exposed to the user content script
            const attemptMetadata = {
                attemptNumber: attempt,
                runBeginTime: Date.now(),
                ...metadata,
            };

            try {
                const {resolve, reject} = await rpc.call({name: 'tabs.run', timeout: 0}, {
                    code,
                    arg,
                    metadata: attemptMetadata,
                });
                return {
                    value: {
                        resolve,
                        reject,
                        attempt,
                    },
                };
            }
            catch (err) {
                if (err.name === 'RPCNoResponse') {
                    log.debug(logProps, {attempt, attemptsLeft}, 'RPCNoResponse');
                    // The frame navigated away while our message was in-flight, instruct TabContentTracker#whenInitialized to
                    // wait for the next content initialization and try again. (unless there are no attempst left)
                    return {retry: true};
                }
                throw err;
            }
        };

        try {
            let {resolve, reject} = await this.tabTracker.whenInitialized(
                browserTabId,
                browserFrameId,
                callback,
                {retryCount},
            );
            log.debug(logProps, 'Content script is done');

            if (reject && reject.stack) {
                reject = {
                    ...reject,
                    stack: resolveScriptContentEvalStack(reject.stack),
                };
            }
            else if (waitForNewPage) { // should only wait for the next page if resolved
                log.debug(logProps, 'Waiting for new page');
                // do not pass on the resolved value, to avoid timing inconsistencies (e.g. the script may have been canceled because of the
                // navigation), but we still pass on thrown errors
                resolve = undefined;

                // the timeout does not start counting until the content script has completed its execution; this is by design
                await Promise.race([
                    waitForNewPagePromise,
                    delay(waitForNewPageTimeoutMs).then(() => Promise.reject(
                        newPageWaitTimeoutError(`Waiting for a new page timed out after ${waitForNewPageTimeoutMs / 1000} seconds`),
                    )),
                ]);
            }

            return {resolve, reject};
        }
        catch (err) {
            // Note: errors thrown in the body of the content script do not end up here.
            log.debug({err}, logProps, 'Failed to run content script');

            if (err.name === 'TabContentTrackerRetriesExhausted') {
                if (waitForNewPage) {
                    // ignore this error in this case because passing waitForNewPage means that we expect the script to cause a navigation
                    return {resolve: undefined, reject: null};
                }

                if (retryCount > 1) {
                    throw contentScriptAbortedError(
                        `Gave up execution of content script after ${retryCount} retries. ` +
                        `The web page might be stuck in a client-side redirect loop`,
                    );
                }
                else {
                    throw contentScriptAbortedError(
                        'The web page has navigated away while the execution of the content script was pending',
                    );
                }
            }
            throw err;
        }
    }

    async getBrowserWindowId() {
        return this.scriptWindow.getBrowserWindowId();
    }

    /**
     * @return {{width: number, height: number}}
     */
    get windowSizeMinusViewport() {
        return this.scriptWindow.sizeMinusViewport;
    }

    async closeAllTabs() {
        assert.isTrue(this._attached, 'TabManager.closeAll: Not initialized yet or in the progress of cleaning up');

        const tabs = [...this.tabTracker.allTabs()];
        const promises = [];

        for (const tab of tabs) {
            const {browserTabId} = tab;
            const tabPromises = [];
            const frames = [...tab.allFrames()];

            log.debug({
                browserTabId,
                browserFrameIds: frames.map(frame => frame.browserFrameId),
            }, 'Calling tabs.contentUnload for all active frames');

            for (const frame of frames) {
                const {browserFrameId} = frame;
                const contentToken = frame.initializedContentToken;
                if (!contentToken) {
                    // not initialized
                    continue;
                }

                const rpc = this.tabContentRPC.get(browserTabId, browserFrameId, contentToken);
                tabPromises.push(
                    rpc.call({name: 'tabs.contentUnload', timeout: 5001})
                    .catch(err => log.warn({err, browserTabId, browserFrameId}, 'Error calling tabs.contentUnload for frame')),
                );
            }

            promises.push(
                Promise.all(tabPromises)
                .then(() => this.browserTabs.remove(browserTabId))
                .catch(err => log.warn({err, browserTabId}, 'Error closing tab')),
            );
        }

        await Promise.all(promises);
    }

    async setWindowSize(options) {
        return await this.scriptWindow.setWindowSize(options);
    }
}

module.exports = TabManager;
