'use strict';
const EventEmitter = require('events').EventEmitter;

const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/TabManager'});
const {contentScriptAbortedError, illegalStateError} = require('../../../../lib/scriptErrors');
const ScriptWindow = require('./ScriptWindow');
const TabTracker = require('./TabTracker');
const TabContentRPC = require('../../../../lib/contentRpc/TabContentRPC');
const {resolveScriptContentEvalStack} = require('../../../../lib/errorParsing');
const {mergeCoverageReports} = require('../../../../lib/mergeCoverage');
const WaitForEvent = require('../../../../lib/WaitForEvent');

class TabManager extends EventEmitter {
    constructor({runtime: browserRuntime, windows: browserWindows, tabs: browserTabs, webNavigation: browserWebNavigation}) {
        super();
        this._attached = false;
        this.browserRuntime = browserRuntime;
        this.browserWindows = browserWindows;
        this.browserTabs = browserTabs;
        this.browserWebNavigation = browserWebNavigation;
        // all tabs opened by the script end up in a single window:
        this.scriptWindow = new ScriptWindow({browserWindows, browserTabs, browserWebNavigation});
        this.myTabs = new TabTracker();
        this.tabContentRPC = new TabContentRPC({
            browserRuntime,
            browserTabs,
            context: 'runner-modules/tabs',
            onRpcInitialize: obj => this.handleRpcInitialize(obj),
        });
        this._navigationCommittedWait = new WaitForEvent(); // key is the browserTabId

        this.handleTabCreated = this.handleTabCreated.bind(this);
        this.handleWebNavigationOnBeforeNavigate = this.handleWebNavigationOnBeforeNavigate.bind(this);
        this.handleWebNavigationOnCommitted = this.handleWebNavigationOnCommitted.bind(this);
        this.handleTabInitialized = this.handleTabInitialized.bind(this);
        this.handleTabsRemoved = this.handleTabsRemoved.bind(this);
        this.scriptWindow.on('windowCreated', ({browserWindowId}) => this.emit('windowCreated', {browserWindowId}));
        this.scriptWindow.on('windowClosed', ({browserWindowId}) => this.emit('windowClosed', {browserWindowId}));

        Object.seal(this);
    }

    attach() {
        this.tabContentRPC.attach();
        this.scriptWindow.attach();
        this.browserTabs.onCreated.addListener(this.handleTabCreated);
        this.browserWebNavigation.onBeforeNavigate.addListener(this.handleWebNavigationOnBeforeNavigate);
        this.browserWebNavigation.onCommitted.addListener(this.handleWebNavigationOnCommitted);
        this.browserTabs.onRemoved.addListener(this.handleTabsRemoved);
        this._attached = true;
    }

    detach() {
        this._attached = false;
        this.tabContentRPC.detach();
        this.scriptWindow.detach();
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
                this.myTabs.register(browserTabId);
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

    handleRpcInitialize({browserTabId, browserFrameId, rpc}) {
        const tab = this.myTabs.getByBrowserTabId(browserTabId);

        if (!tab) {
            return; // not my tab
        }

        if (browserFrameId) {
            return; // todo
        }

        rpc.method('tabs.mainContentInit', () => this.handleTabInitialized(browserTabId));
        rpc.method('tabs.contentInit', ({moduleName}) => this.handleTabModuleInitialized(browserTabId, moduleName));
        rpc.method('core.submitCodeCoverage', contentCoverage => {
            // eslint-disable-next-line camelcase, no-undef
            const myCoverage = typeof __runner_coverage__ === 'object' && __runner_coverage__;
            if (myCoverage) {
                mergeCoverageReports(myCoverage, contentCoverage);
            }
        });
        this.emit('initializedTabRpc', {tab, rpc});
    }

    handleWebNavigationOnBeforeNavigate({tabId: browserTabId, frameId, url}) {
        try {
            log.debug({browserTabId, frameId, url}, 'browser.webNavigation.onBeforeNavigate');

            if (frameId) { // frameId === 0 is top; otherwise it is an iframe
                return;
            }

            this.myTabs.markUninitialized(browserTabId);
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onBeforeNavigate');
        }
    }

    handleWebNavigationOnCommitted({tabId: browserTabId, frameId, url}) {
        try {
            log.debug({browserTabId, frameId, url}, 'browser.webNavigation.onCommitted');

            if (frameId) { // frameId === 0 is top; otherwise it is an iframe
                return;
            }

            this._navigationCommittedWait.resolve(browserTabId);
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onCommitted');
        }
    }

    handleTabInitialized(browserTabId) {
        const tab = this.myTabs.getByBrowserTabId(browserTabId);
        const isMyTab = Boolean(tab);
        log.info({browserTabId, isMyTab}, 'Main tab content script has been initialized');

        if (!isMyTab) {
            return; // the tab does not belong to this script
        }

        this.myTabs.markUninitialized(browserTabId);
        this.myTabs.expectInitToken(browserTabId, 'tabs');
        const rpc = this.tabContentRPC.get(browserTabId, TabContentRPC.TOP_LEVEL_FRAME_ID);

        const files = [];
        const executeContentScript = (initToken, file) => {
            log.debug({browserTabId, initToken, file}, 'Executing content script for runner module');
            this.myTabs.expectInitToken(browserTabId, String(initToken));
            files.push(String(file));
        };

        this.emit('initializingTabContent', {tab, executeContentScript, rpc});

        for (const file of files) {
            this.browserTabs.executeScript(browserTabId, {
                allFrames: false,
                frameId: 0, // top
                file,
                runAt: 'document_start',
            });
        }

        this._markInitialized(browserTabId, 'tabs');
    }

    handleTabModuleInitialized(browserTabId, moduleName) {
        log.debug({browserTabId, moduleName}, 'Module tab content script has been initialized');
        this._markInitialized(browserTabId, moduleName);
    }

    _markInitialized(browserTabId, initToken) {
        if (this.myTabs.markInitialized(browserTabId, initToken)) {
            log.info({browserTabId}, 'All tab content scripts have initialized');
            const tab = this.myTabs.getByBrowserTabId(browserTabId);
            this.emit('initializedTabContent', {tab});

            const rpc = this.tabContentRPC.get(browserTabId, TabContentRPC.TOP_LEVEL_FRAME_ID);
            rpc.callAndForget('tabs.initializedTabContent');
        }
    }

    async createTab() {
        if (!this._attached) {
            throw illegalStateError('TabManager.createTab: Not initialized yet or in the progress of cleaning up');
        }
        // note: "about:blank" might cause our content scripts to not run, but that is okay: that will simply cause the tab to not be
        // marked as "initialized". runner scripts are expected to call tab.navigate(url) before interacting further with that tab
        const browserTab = await this.scriptWindow.createTab('about:blank');
        const {id: browserTabId} = browserTab;

        this.myTabs.register(browserTabId);
        return this.myTabs.getByBrowserTabId(browserTabId);
    }

    hasTab(id) {
        return this.myTabs.has(id);
    }

    getTab(id) {
        return this.myTabs.get(id);
    }

    async navigateTab(id, url) {
        if (!this._attached) {
            throw illegalStateError('TabManager.navigateTab: Not initialized yet or in the progress of cleaning up');
        }

        const {browserTabId} = this.myTabs.get(id);
        this.myTabs.markUninitialized(browserTabId);

        // wait for the onCommitted event (which occurs even if there was an error downloading the page)
        // a new navigation might fail if onCommitted has not fired yet (firefox 57).
        await this._navigationCommittedWait.wait(browserTabId, async () => {
            log.debug({browserTabId, url}, 'Navigating tab to new url');
            await browser.tabs.update(browserTabId, {url});
            await this.myTabs.waitForTabInitialization(browserTabId);
        });
    }

    async runContentScript(id, code, {arg, metadata = {}} = {}) {
        if (!this._attached) {
            throw illegalStateError('TabManager.runContentScript: Not initialized yet or in the progress of cleaning up');
        }

        const {browserTabId} = this.myTabs.get(id);
        await this.myTabs.waitForTabInitialization(browserTabId);
        const rpc = this.tabContentRPC.get(browserTabId, TabContentRPC.TOP_LEVEL_FRAME_ID);

        const rpcPromise = Promise.race([
            rpc.call({name: 'tabs.run', timeout: 0}, {code, arg, metadata}),
            this.myTabs.waitForTabUninitialization(browserTabId).then(() => {
                throw contentScriptAbortedError(
                    'The web page has navigated away while the execution of the content script was pending'
                );
            }),
        ]);

        const {resolve, reject} = await rpcPromise;

        if (reject && reject.stack) {
            reject.stack = resolveScriptContentEvalStack(reject.stack);
        }

        return {resolve, reject};
    }

    async waitForNewContent(id) {
        if (!this._attached) {
            throw illegalStateError('TabManager.waitForNewContent: Not initialized yet or in the progress of cleaning up');
        }

        const {browserTabId} = this.myTabs.get(id);
        await this.myTabs.waitForNextTabInitialization(browserTabId);
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

    async closeScriptWindow() {
        if (!this._attached) {
            throw illegalStateError('TabManager.closeScriptWindow: Not initialized yet or in the progress of cleaning up');
        }

        log.debug({
            browserTabIds: [...this.myTabs].map(tab => tab.browserTabId),
        }, 'Calling tabs.contentUnload for all active tabs');

        const promises = [];
        for (const {browserTabId, initialized} of this.myTabs) {
            if (!initialized) {
                continue;
            }

            const rpc = this.tabContentRPC.get(browserTabId, TabContentRPC.TOP_LEVEL_FRAME_ID);
            promises.push(
                rpc.call({name: 'tabs.contentUnload', timeout: 5001})
                .catch(err => log.warn({err, browserTabId}, 'Error calling tabs.contentUnload for tab'))
            );
        }
        await Promise.all(promises);

        await this.scriptWindow.close();
    }

    async setWindowSize(options) {
        return await this.scriptWindow.setWindowSize(options);
    }
}

module.exports = TabManager;
