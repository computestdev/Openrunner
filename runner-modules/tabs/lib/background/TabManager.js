'use strict';
const EventEmitter = require('events').EventEmitter;

const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/TabManager'});
const ScriptWindow = require('./ScriptWindow');
const TabTracker = require('./TabTracker');
const TabContentRPC = require('../../../../lib/TabContentRPC');
const {resolveScriptContentEvalStack} = require('../../../../lib/errorParsing');

class TabManager extends EventEmitter {
    constructor({runtime: browserRuntime, windows: browserWindows, tabs: browserTabs, webNavigation: browserWebNavigation}) {
        super();
        this._attached = false;
        this.browserRuntime = browserRuntime;
        this.browserWindows = browserWindows;
        this.browserTabs = browserTabs;
        this.browserWebNavigation = browserWebNavigation;
        // all tabs opened by the script end up in a single window:
        this.scriptWindow = new ScriptWindow(browserWindows, browserTabs);
        this.myTabs = new TabTracker();
        this.tabContentRPC = new TabContentRPC({
            browserRuntime,
            browserTabs,
            context: 'runner-modules/tabs',
            onRpcInitialize: obj => this.handleRpcInitialize(obj),
        });

        this.handleTabCreated = this.handleTabCreated.bind(this);
        this.handleWebNavigationOnBeforeNavigate = this.handleWebNavigationOnBeforeNavigate.bind(this);
        this.handleTabInitialized = this.handleTabInitialized.bind(this);
        this.handleTabsRemoved = this.handleTabsRemoved.bind(this);
        this.scriptWindow.on('windowCreated', ({browserWindowId}) => this.emit('windowCreated', {browserWindowId}));
        this.scriptWindow.on('windowClosed', ({browserWindowId}) => this.emit('windowClosed', {browserWindowId}));

        Object.seal(this);
    }

    attach() {
        this.tabContentRPC.attach();
        this.browserTabs.onCreated.addListener(this.handleTabCreated);
        this.browserWebNavigation.onBeforeNavigate.addListener(this.handleWebNavigationOnBeforeNavigate);
        this.browserTabs.onRemoved.addListener(this.handleTabsRemoved);
        this._attached = true;
    }

    detach() {
        this._attached = false;
        this.tabContentRPC.detach();
        this.browserTabs.onCreated.removeListener(this.handleTabCreated);
        this.browserWebNavigation.onBeforeNavigate.removeListener(this.handleWebNavigationOnBeforeNavigate);
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

            const {id} = this.myTabs.getByBrowserTabId(browserTabId);
            // We could use `browserTab.openerTabId` to figure out if the tab was opened by us
            // however: https://bugzilla.mozilla.org/show_bug.cgi?id=1238314
            // So set these preferences in perform-runner-pm for now:
            //     browser.link.open_newwindow = 3
            //     browser.link.open_newwindow.restriction = 0

            this.emit('tabCreated', {id});
        }
        catch (err) {
            log.error({err}, 'Error in browser.tabs.onCreated');
        }
    }

    handleTabsRemoved(browserTabId, removeInfo) {
        this.myTabs.markClosed(browserTabId);
    }

    handleRpcInitialize({browserTabId, rpc}) {
        const tabData = this.myTabs.getByBrowserTabId(browserTabId);

        if (!tabData) {
            return; // not my tab
        }

        rpc.notification('tabs.mainContentInit', () => this.handleTabInitialized(browserTabId));
        rpc.notification('tabs.contentInit', ({moduleName}) => this.handleTabModuleInitialized(browserTabId, moduleName));
        this.emit('initializedTabRpc', {id: tabData.id, rpc});
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

    handleTabInitialized(browserTabId) {
        const tabData = this.myTabs.getByBrowserTabId(browserTabId);
        const isMyTab = Boolean(tabData);
        log.info({browserTabId, isMyTab}, 'Main tab content script has been initialized');

        if (!isMyTab) {
            return; // the tab does not belong to this script
        }

        this.myTabs.markUninitialized(browserTabId);
        this.myTabs.expectInitToken(browserTabId, 'tabs');
        const rpc = this.tabContentRPC.get(browserTabId);

        const files = [];
        const executeContentScript = (initToken, file) => {
            log.debug({browserTabId, initToken, file}, 'Executing content script for runner module');
            this.myTabs.expectInitToken(browserTabId, String(initToken));
            files.push(String(file));
        };

        this.emit('initializingTabContent', {id: tabData.id, executeContentScript, rpc});

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
            const {id} = this.myTabs.getByBrowserTabId(browserTabId);
            this.emit('initializedTabContent', {id});

            const rpc = this.tabContentRPC.get(browserTabId);
            rpc.call('tabs.initializedTabContent')
            .catch(err => log.error({err}, 'Error while calling tabs.initializedTabContent in content'));
        }
    }

    async createTab() {
        if (!this._attached) {
            throw Error('Invalid state');
        }
        // note: "about:blank" might cause our content scripts to not run, but that is okay: that will simply cause the tab to not be
        // marked as "initialized". runner scripts are expected to call tab.navigate(url) before interacting further with that tab
        const browserTab = await this.scriptWindow.createTab('about:blank');
        const {id: browserTabId} = browserTab;

        this.myTabs.register(browserTabId);
        const {id} = this.myTabs.getByBrowserTabId(browserTabId);
        return id;
    }

    hasTab(id) {
        return this.myTabs.has(id);
    }

    getBrowserTabId(id) {
        const tab = this.myTabs.get(id);
        return tab ? tab.browserTabId : null;
    }

    async navigateTab(id, url) {
        if (!this._attached) {
            throw Error('Invalid state');
        }

        const {browserTabId} = this.myTabs.get(id);
        this.myTabs.markUninitialized(browserTabId);
        await browser.tabs.update(browserTabId, {url});
        await this.myTabs.waitForTabInitialization(browserTabId);
    }

    async runContentScript(id, code, {arg, metadata = {}} = {}) {
        if (!this._attached) {
            throw Error('Invalid state');
        }

        const {browserTabId} = this.myTabs.get(id);
        await this.myTabs.waitForTabInitialization(browserTabId);
        const rpc = this.tabContentRPC.get(browserTabId);

        const rpcPromise = Promise.race([
            rpc.call({name: 'tabs.run', timeout: 0}, {code, arg, metadata}),
            this.myTabs.waitForTabUninitialization(browserTabId).then(() => {
                const error = Error('The web page has navigated away while the execution of the content script was pending');
                error.contentScriptCancelledByNavigation = true;
                throw error;
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
            throw Error('Invalid state');
        }

        const {browserTabId} = this.myTabs.get(id);
        await this.myTabs.waitForNextTabInitialization(browserTabId);
    }

    async getBrowserWindowId() {
        return this.scriptWindow.getBrowserWindowId();
    }

    async closeScriptWindow() {
        if (!this._attached) {
            throw Error('Invalid state');
        }

        log.debug({
            browserTabIds: [...this.myTabs].map(tab => tab.browserTabId),
        }, 'Calling tabs.contentUnload for all active tabs');

        const promises = [];
        for (const {browserTabId, initialized} of this.myTabs) {
            if (!initialized) {
                continue;
            }

            const rpc = this.tabContentRPC.get(browserTabId);
            promises.push(
                rpc.call({name: 'tabs.contentUnload', timeout: 5001})
                .catch(err => log.warn({err, browserTabId}, 'Error calling tabs.contentUnload for tab'))
            );
        }
        await Promise.all(promises);

        await this.scriptWindow.close();
    }
}

module.exports = TabManager;
