'use strict';
const TabContentRPC = require('../../../lib/TabContentRPC');
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'core/background/ScratchpadRPC'});
const scratchpadMethods = require('./scratchpadMethods');
const scratchpadUrls = require('../scratchpad-content/urls');

const VALID_URLS = new Set([
    scratchpadUrls.SCRATCHPAD_HTML,
    scratchpadUrls.SCRATCHPAD_RESULT_HTML,
    scratchpadUrls.SCRATCHPAD_BREAKDOWN_HTML,
]);

class ScratchpadRPC {
    constructor({browserRuntime, browserTabs, browserDownloads, browserWebNavigation}) {
        this.browserRuntime = browserRuntime;
        this.browserTabs = browserTabs;
        this.browserDownloads = browserDownloads;
        this.browserWebNavigation = browserWebNavigation;
        this.tabContentRPC = new TabContentRPC({
            browserRuntime,
            browserTabs,
            context: 'Scratchpad',
        });
        this.handleWebNavigationOnCommitted = this.handleWebNavigationOnCommitted.bind(this);
        this.handleBrowserTabsOnRemoved = this.handleBrowserTabsOnRemoved.bind(this);
        this.tabsByBrowserId = new Map(); // browserTabId => {initialized, initPromise, initResolver, rpc}
        Object.freeze(this);
    }

    attach() {
        this.tabContentRPC.attach();
        this.browserWebNavigation.onCommitted.addListener(this.handleWebNavigationOnCommitted);
        this.browserTabs.onRemoved.addListener(this.handleBrowserTabsOnRemoved);
    }

    detach() {
        this.browserWebNavigation.onCommitted.removeListener(this.handleWebNavigationOnCommitted);
        this.browserTabs.onRemoved.removeListener(this.handleBrowserTabsOnRemoved);
        this.tabContentRPC.detach();
    }

    _resetTabDataInitPromise(data) {
        data.initPromise = new Promise((resolve, reject) => {
            data.initResolve = resolve;
            data.initReject = reject;
        });
    }

    _getTabData(browserTabId) {
        if (!this.tabsByBrowserId.get(browserTabId)) {
            const data = {
                initialized: false,
            };
            this._resetTabDataInitPromise(data);
            this.tabsByBrowserId.set(browserTabId, data);
        }
        return this.tabsByBrowserId.get(browserTabId);
    }

    handleWebNavigationOnCommitted({tabId: browserTabId, frameId, url}) {
        try {
            const validUrl = VALID_URLS.has(url);
            log.debug({browserTabId, frameId, url, validUrl}, 'browser.webNavigation.onCommitted');

            if (frameId || !validUrl) { // frameId === 0 is top; otherwise it is an iframe
                return;
            }

            const tabData = this._getTabData(browserTabId);
            if (tabData.initialized) {
                tabData.initialized = false;
                this._resetTabDataInitPromise(tabData);
            }

            const rpc = this.tabContentRPC.reinitialize(browserTabId);
            tabData.rpc = rpc;

            rpc.method('initialized', () => {
                const tabData = this._getTabData(browserTabId);
                tabData.initResolve();
                log.info({browserTabId}, 'Scratchpad tab has been initialized');
            });
            rpc.methods(scratchpadMethods({
                browserTabId,
                browserTabs: this.browserTabs,
                browserDownloads: this.browserDownloads,
                rpc,
                scratchpadRPC: this,
            }));
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onCommitted');
        }
    }

    handleBrowserTabsOnRemoved({tabId: browserTabId}) {
        if (this.tabsByBrowserId.has(browserTabId)) {
            const tabData = this._getTabData(browserTabId);
            tabData.initReject(Error('This tab has been closed'));
            this.tabsByBrowserId.delete(browserTabId);
        }
    }

    async waitForInitialization(browserTabId) {
        await this.browserTabs.get(browserTabId); // throws if the tab no longer exists
        const tabData = this._getTabData(browserTabId);
        await tabData.initPromise;
    }

    async createTab(options) {
        const {id: browserTabId} = await this.browserTabs.create(options);
        await this.waitForInitialization(browserTabId);
        return browserTabId;
    }

    async getRpc(browserTabId) {
        await this.browserTabs.get(browserTabId); // throws if the tab no longer exists
        const {rpc} = this._getTabData(browserTabId);
        return rpc;
    }
}

module.exports = ScratchpadRPC;
