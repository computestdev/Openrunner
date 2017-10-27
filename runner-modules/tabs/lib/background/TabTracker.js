'use strict';

class Tab {
    constructor(id, browserTabId) {
        const self = this;
        this.public = Object.freeze({
            id,
            browserTabId,
            /**
             * Has this tab been closed?
             * @return {boolean}
             */
            get closed() {
                return self.closed;
            },
            /**
             * Is this tab currently initialized? If `false`: the tab has just been opened, or is busy navigating to a new URL
             * @return {number}
             */
            get initialized() {
                return self.initialized;
            },
        });
        this.initCount = 0;
        this.initMarked = false;
        this.pendingInitTokens = new Set();
        this.closed = false;
        Object.seal(this);
    }

    get id() {
        return this.public.id;
    }

    get browserTabId() {
        return this.public.browserTabId;
    }

    get initialized() {
        return Boolean(!this.closed && this.initMarked && this.pendingInitTokens.size === 0);
    }
}

class TabTracker {
    constructor() {
        this.nextTabId = Math.floor(Math.random() * 1000000);
        this.tabs = new Map(); // id => Tab
        this.tabsByBrowserId = new Map(); // browserId => Tab
        this.waitForTabInitializationResolvers = new Set();
        this.waitForTabUninitializationResolvers = new Set();
        Object.seal(this);
    }

    * [Symbol.iterator]() {
        for (const tab of this.tabs.values()) {
            yield tab.public;
        }
    }

    register(browserTabId) {
        {
            const tab = this.tabsByBrowserId.get(browserTabId);
            if (tab) {
                return tab.public;
            }
        }

        const id = this.nextTabId++;
        const tab = new Tab(id, browserTabId);
        this.tabs.set(id, tab);
        this.tabsByBrowserId.set(browserTabId, tab);
        return tab.public;
    }

    has(id) {
        return this.tabs.has(id);
    }

    get(id) {
        const tab = this.tabs.get(id);
        return tab ? tab.public : null;
    }

    hasBrowserTabId(browserTabId) {
        return this.tabsByBrowserId.has(browserTabId);
    }

    getByBrowserTabId(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        return tab ? tab.public : null;
    }

    markUninitialized(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            return;
        }

        tab.initMarked = false;

        for (const resolver of this.waitForTabUninitializationResolvers) {
            if (resolver.browserTabId === browserTabId) {
                this.waitForTabUninitializationResolvers.delete(resolver);
                resolver.resolve();
            }
        }
    }

    expectInitToken(browserTabId, initToken) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            throw Error('expectInitToken(): the given browserTabId has not been registered');
        }

        tab.pendingInitTokens.add(initToken);
    }

    markInitialized(browserTabId, initToken) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            throw Error('markInitialized(): the given browserTabId has not been registered');
        }

        const wasInitialized = tab.initialized;
        tab.initMarked = true;
        tab.pendingInitTokens.delete(initToken);

        if (tab.initialized) {
            if (!wasInitialized) {
                ++tab.initCount;
            }

            const {initCount} = tab;
            for (const resolver of this.waitForTabInitializationResolvers) {
                if (resolver.browserTabId === browserTabId && initCount >= resolver.expectedInitCount) {
                    this.waitForTabInitializationResolvers.delete(resolver);
                    resolver.resolve();
                }
            }
        }

        return tab.initialized;
    }

    async waitForTabInitialization(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (tab && tab.initialized) {
            return;
        }

        await this.waitForNextTabInitialization(browserTabId);
    }

    async waitForNextTabInitialization(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        const initCount = tab ? tab.initCount : 0;

        await new Promise(resolve => this.waitForTabInitializationResolvers.add({
            browserTabId,
            resolve,
            expectedInitCount: initCount + 1,
        }));
    }

    async waitForTabUninitialization(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab || !tab.initialized) {
            return;
        }

        await new Promise(resolve => this.waitForTabUninitializationResolvers.add({browserTabId, resolve}));
    }

    markClosed(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            return;
        }

        tab.closed = true;
    }
}

module.exports = TabTracker;
