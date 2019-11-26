'use strict';
const EventEmitter = require('events').EventEmitter;
const {assert} = require('chai');

const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/TabManager'});
const {contentScriptAbortedError} = require('../../../../lib/scriptErrors');
const TabTracker = require('./TabTracker');
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
        this.myTabs = new TabTracker();
        this.tabContentRPC = new TabContentRPC({
            browserRuntime,
            browserTabs,
            context: 'runner-modules/tabs',
            onRpcInitialize: obj => this.handleRpcInitialize(obj),
            filterSender: tab => this.myTabs.hasBrowserTabId(tab.id),
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

            if (tabIsInMyWindow) {
                this.myTabs.registerTab(browserTabId);
            }
            else {
                return; // the tab does not belong to this script
            }

            const tab = this.myTabs.getByBrowserTabId(browserTabId);
            // We could use `browserTab.openerTabId` to figure out if the tab was opened by us
            // however: https://bugzilla.mozilla.org/show_bug.cgi?id=1238314
            // So set these preferences in perform-runner-pm for now:
            //     browser.link.open_newwindow = 3
            //     browser.link.open_newwindow.restriction = 0

            this.emit('tabCreated', {tab});
        }
        catch (err) {
            log.error({err}, 'Error in browser.tabs.onCreated');
        }
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        this.myTabs.markClosed(browserTabId);
    }

    async _registerAncestorFrames(tab, browserFrameId) {
        const {browserTabId} = tab;
        const {parentFrameId: parentBrowserFrameId} = await this.browserWebNavigation.getFrame({
            tabId: browserTabId,
            frameId: browserFrameId,
        });

        // top = 0; -1 = there is no parent
        if (parentBrowserFrameId >= 0 && parentBrowserFrameId  !== browserFrameId && !tab.hasFrame(parentBrowserFrameId)) {
            await this._registerAncestorFrames(tab, parentBrowserFrameId);
        }

        return this.myTabs.registerFrame(browserTabId, parentBrowserFrameId, browserFrameId);
    }

    async handleRpcInitialize({browserTabId, browserFrameId, rpc}) {
        const tab = this.myTabs.getByBrowserTabId(browserTabId);
        log.debug({browserTabId, browserFrameId, myTab: Boolean(tab)}, 'handleRpcInitialize');

        if (!tab) {
            return; // not my tab
        }

        const frame = await this._registerAncestorFrames(tab, browserFrameId);
        rpc.methods(contentMethods(this, frame));
        this.emit('initializedTabRpc', {tab, frame, rpc});
    }

    handleWebNavigationOnBeforeNavigate({tabId: browserTabId, frameId: browserFrameId, url}) {
        try {
            log.debug({browserTabId, browserFrameId, url}, 'browser.webNavigation.onBeforeNavigate');
            this.myTabs.markUninitialized(browserTabId, browserFrameId);
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

    async handleTabMainContentInitialized(browserTabId, browserFrameId) {
        const tab = this.myTabs.getByBrowserTabId(browserTabId);
        const isMyTab = Boolean(tab);

        if (!isMyTab) {
            log.info({browserTabId, browserFrameId, isMyTab}, 'handleTabMainContentInitialized for a different script or unknown tab');
            return; // the tab does not belong to this script
        }

        // this resets the value for `currentContentId`
        this.myTabs.markUninitialized(browserTabId, browserFrameId);

        const frame = tab.getFrame(browserFrameId);
        assert.isOk(frame, `Frame ${browserFrameId} has not been registered for tab ${browserTabId}`);
        this.myTabs.expectInitToken(browserTabId, browserFrameId, 'tabs');
        const rpc = this.tabContentRPC.get(browserTabId, browserFrameId);

        const contentId = frame.currentContentId;
        log.info({browserTabId, browserFrameId, contentId}, 'Main tab content script has been initialized');

        await rpc.call('tabs.initializedMainTabContent', {
            scriptApiVersion: this.scriptApiVersion,
            contentId,
        });

        const files = [];
        const executeContentScript = (initToken, file) => {
            log.debug({browserTabId, browserFrameId, contentId, initToken, file}, 'Executing content script for runner module');
            this.myTabs.expectInitToken(browserTabId, browserFrameId, String(initToken));
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

        this.handleTabModuleInitialized(browserTabId, browserFrameId, contentId, 'tabs');
    }

    handleTabModuleInitialized(browserTabId, browserFrameId, receivedContentId, initToken) {
        const tab = this.myTabs.getByBrowserTabId(browserTabId);
        assert.isOk(tab, 'tab');
        const frame = tab.getFrame(browserFrameId);
        assert.isOk(frame, 'frame');
        const contentId = frame.currentContentId;

        log.debug({browserTabId, receivedContentId, contentId, initToken}, 'Module tab content script has been initialized');

        if (this.myTabs.markInitialized(browserTabId, browserFrameId, initToken)) {
            log.info({browserTabId, browserFrameId, contentId}, 'All tab content scripts have initialized');
            this.emit('initializedTabContent', {tab, frame});

            const rpc = this.tabContentRPC.get(browserTabId, browserFrameId);
            rpc.callAndForget('tabs.initializedTabContent', {contentId});

            if (frame && frame.hasParentFrame) {
                const parentRpc = this.tabContentRPC.get(browserTabId, frame.parentBrowserFrameId);
                parentRpc.callAndForget('tabs.childFrameInitialized', {browserFrameId});
            }
        }
    }

    async createTab() {
        assert.isTrue(this._attached, 'TabManager#createTab: Not initialized yet or in the progress of cleaning up');
        // note: "about:blank" might cause our content scripts to not run, but that is okay: that will simply cause the tab to not be
        // marked as "initialized". runner scripts are expected to call tab.navigate(url) before interacting further with that tab
        const browserTab = await this.scriptWindow.createTab('about:blank');
        const {id: browserTabId} = browserTab;

        this.myTabs.registerTab(browserTabId);
        return this.myTabs.getByBrowserTabId(browserTabId);
    }

    hasTab(id) {
        return this.myTabs.hasTab(id);
    }

    getTab(id) {
        return this.myTabs.getTab(id);
    }

    async navigateTab(id, url) {
        assert.isTrue(this._attached, 'TabManager#navigateTab: Not initialized yet or in the progress of cleaning up');

        const {browserTabId} = this.myTabs.getTab(id);
        this.myTabs.markUninitialized(browserTabId, TOP_FRAME_ID);

        // wait for the onCommitted event (which occurs even if there was an error downloading the page)
        // a new navigation might fail if onCommitted has not fired yet (firefox 57).
        await this._navigationCommittedWait.wait([browserTabId, TOP_FRAME_ID], async () => {
            log.debug({browserTabId, TOP_FRAME_ID, url}, 'Navigating tab to new url');
            await this.browserTabs.update(browserTabId, {url});
            await this.myTabs.waitForTabContentInitialization(browserTabId, TOP_FRAME_ID);
        });
    }

    async runContentScript(id, browserFrameId, code, {arg, metadata = {}} = {}) {
        assert.isTrue(this._attached, 'TabManager#runContentScript: Not initialized yet or in the progress of cleaning up');

        const tab = this.myTabs.getTab(id);
        assert.isOk(tab, 'tab');
        const frame = tab.getFrame(browserFrameId);
        assert.isOk(frame, 'frame');
        const {browserTabId} = tab;
        const contentId = frame.currentContentId;

        await this.myTabs.waitForTabContentInitialization(browserTabId, browserFrameId);
        const rpc = this.tabContentRPC.get(browserTabId, browserFrameId);

        const rpcPromise = Promise.race([
            rpc.call({name: 'tabs.run', timeout: 0}, {contentId, code, arg, metadata}).catch(err => {
                if (err.name === 'RPCNoResponse') {
                    throw contentScriptAbortedError(
                        'The web page has navigated away while the execution of the content script was pending (RPCNoResponse)',
                    );
                }
                throw err;
            }),
            this.myTabs.waitForTabUninitialization(browserTabId, browserFrameId).then(() => {
                throw contentScriptAbortedError(
                    'The web page has navigated away while the execution of the content script was pending',
                );
            }),
        ]);

        const {resolve, reject} = await rpcPromise;

        if (reject && reject.stack) {
            reject.stack = resolveScriptContentEvalStack(reject.stack);
        }

        return {resolve, reject};
    }

    async waitForNewContent(id, browserFrameId) {
        assert.isTrue(this._attached, 'TabManager#waitForNewContent: Not initialized yet or in the progress of cleaning up');

        const {browserTabId} = this.myTabs.getTab(id);
        await this.myTabs.waitForNextTabContentInitialization(browserTabId, browserFrameId);
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

        const tabs = [...this.myTabs];
        const promises = [];

        for (const tab of tabs) {
            const {browserTabId} = tab;
            const tabPromises = [];
            const frames = [...tab.frames()];

            log.debug({
                browserTabId,
                browserFrameIds: frames.map(frame => frame.browserFrameId),
            }, 'Calling tabs.contentUnload for all active frames');

            for (const frame of frames) {
                const {browserFrameId, initialized} = frame;
                if (!initialized) {
                    continue;
                }

                const contentId = frame.currentContentId;
                const rpc = this.tabContentRPC.get(browserTabId, browserFrameId);
                tabPromises.push(
                    rpc.call({name: 'tabs.contentUnload', timeout: 5001}, {contentId})
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
