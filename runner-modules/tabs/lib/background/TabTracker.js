'use strict';
const {generate: generateShortId} = require('shortid');
const SymbolTree = require('symbol-tree');
const {assert} = require('chai');

const frameTree = new SymbolTree();
const NULL_FRAME_ID = -1; // same as WebExtension
const TOP_FRAME_ID = 0;

class Frame {
    constructor(tab, browserFrameId) {
        const self = this;
        frameTree.initialize(this);
        this.browserFrameId = browserFrameId;
        this.tab = tab;
        this.initCount = 0;
        this.initMarked = false;
        this.destroyed = false;
        this.currentContentId = null;
        this.pendingInitTokens = new Set();
        this.public = {
            get browserFrameId() {
                return self.browserFrameId;
            },

            get parentFrame() {
                const parent = self.parentFrame;
                return parent && parent.public;
            },

            get hasParentFrame() {
                return self.hasParentFrame;
            },

            get parentBrowserFrameId() {
                return self.parentBrowserFrameId;
            },

            get tab() {
                return self.tab.public;
            },

            /**
             * Has this frame been destroyed? This means that the parent frame has navigated away
             * @return {boolean}
             */
            get destroyed() {
                return self.destroyed;
            },

            /**
             * Is this frame currently initialized? If `false`: the frame has just been created, or is busy navigating to a new URL
             * @return {boolean}
             */
            get initialized() {
                return self.initialized;
            },

            /**
             * An unique ID which represents a single frame-content instance. Navigating to a new URL resets this id.
             * This id might be null before the first navigation
             * @return {?string}
             */
            get currentContentId() {
                return self.currentContentId;
            },

            isChild(otherFrame) {
                return self.isChild(otherFrame);
            },
        };
        Object.freeze(this.public);
        Object.seal(this);
    }

    /**
     * @return {?Frame}
     */
    get parentFrame() {
        return frameTree.parent(this);
    }

    get hasParentFrame() {
        return Boolean(this.parentFrame);
    }

    get parentBrowserFrameId() {
        const parent = this.parentFrame;
        return parent ? parent.browserFrameId : NULL_FRAME_ID;
    }

    get initialized() {
        return Boolean(!this.tab.closed && !this.destroyed && this.initMarked && this.pendingInitTokens.size === 0);
    }

    isChild(otherFrame) {
        return Boolean(otherFrame && otherFrame.parentBrowserFrameId === this.browserFrameId);
    }
}

class Tab {
    constructor(id, browserTabId) {
        const self = this;
        this.id = id;
        this.browserTabId = browserTabId;
        this.frames = new Map(); // browserFrameId => Frame
        this.closed = false;
        this.public = {
            get id() {
                return self.id;
            },

            get browserTabId() {
                return self.browserTabId;
            },
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

            /**
             * An unique ID which represents a single top level frame instance. Navigating to a new URL resets this id.
             * This id might be null before the first navigation
             * @return {?string}
             */
            get currentContentId() {
                return self.currentContentId;
            },

            hasFrame(browserFrameId) {
                return self.hasFrame(browserFrameId);
            },

            getFrame(browserFrameId) {
                const frame = self.getFrame(browserFrameId);
                return frame && frame.public;
            },

            get topFrame() {
                return this.getFrame(TOP_FRAME_ID);
            },
        };
        Object.freeze(this.public);
        Object.seal(this);
    }

    hasFrame(browserFrameId) {
        return this.frames.has(browserFrameId);
    }

    /**
     * @param {number} browserFrameId
     * @return {?Frame}
     */
    getFrame(browserFrameId) {
        return this.frames.get(browserFrameId) || null;
    }

    /**
     * @param {number} parentBrowserFrameId
     * @param {number} browserFrameId
     * @return {?Frame}
     */
    createFrame(parentBrowserFrameId, browserFrameId) {
        assert.isFalse(this.hasFrame(browserFrameId), 'Tab#createFrame(): Given browserFrameId already exists');
        const frame = new Frame(this, browserFrameId);

        // -1 is used by the WebExtension api to indicate that there is no parent
        if (parentBrowserFrameId >= 0) {
            const parent = this.getFrame(parentBrowserFrameId);
            assert.isOk(parent, 'Tab#createFrame(): Given parentBrowserFrameId does not exist');
            frameTree.appendChild(parent, frame);
        }

        this.frames.set(browserFrameId, frame);
        return this.getFrame(browserFrameId);
    }

    destroyFrame(browserFrameId, {descendantsOnly = false} = {}) {
        const topFrame = this.getFrame(browserFrameId);
        if (!topFrame) {
            return;
        }

        for (const frame of frameTree.treeIterator(topFrame)) {
            if (descendantsOnly && frame === topFrame) {
                continue;
            }

            frame.destroyed = true;
            this.frames.delete(browserFrameId);
            frameTree.remove(frame);
        }
    }
}

class TabTracker {
    constructor() {
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

    * frames() {
        for (const tab of this.tabs.values()) {
            for (const frame of tab.frames.values()) {
                yield frame.public;
            }
        }
    }

    registerTab(browserTabId) {
        {
            const tab = this.tabsByBrowserId.get(browserTabId);
            if (tab) {
                return tab.public;
            }
        }

        const id = generateShortId(); // this id is visible to openrunner scripts, the browserTabId is not
        const tab = new Tab(id, browserTabId);
        this.tabs.set(id, tab);
        this.tabsByBrowserId.set(browserTabId, tab);
        return tab.public;
    }

    registerFrame(browserTabId, parentBrowserFrameId, browserFrameId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        assert.isOk(tab, 'registerFrame(): the given browserTabId has not been registered');

        {
            const frame = tab.getFrame(browserFrameId);
            if (frame) {
                assert.strictEqual(
                    frame.parentBrowserFrameId,
                    parentBrowserFrameId,
                    'TabTracker#registerFrame called multiple times with different values for parentBrowserFrameId'
                );

                return frame.public;
            }
        }

        const frame = tab.createFrame(parentBrowserFrameId, browserFrameId);
        return frame.public;
    }

    hasTab(tabId) {
        return this.tabs.has(tabId);
    }

    getTab(tabId) {
        const tab = this.tabs.get(tabId);
        return tab ? tab.public : null;
    }

    _getFramePrivate(browserTabId, browserFrameId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            return null;
        }

        return tab.getFrame(browserFrameId);
    }

    hasBrowserTabId(browserTabId) {
        return this.tabsByBrowserId.has(browserTabId);
    }

    getByBrowserTabId(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        return tab ? tab.public : null;
    }

    markUninitialized(browserTabId, browserFrameId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            return;
        }

        const frame = tab.getFrame(browserFrameId);
        if (!frame) {
            return;
        }

        frame.initMarked = false;

        for (const resolver of this.waitForTabUninitializationResolvers) {
            if (resolver.browserTabId === browserTabId && resolver.browserFrameId === browserFrameId) {
                this.waitForTabUninitializationResolvers.delete(resolver);
                resolver.resolve();
            }
        }

        // This frame is navigating to somewhere else. All the DOM nodes will be destroyed, including the iframes
        tab.destroyFrame(browserFrameId, {descendantsOnly: true});
    }

    expectInitToken(browserTabId, browserFrameId, initToken) {
        const frame = this._getFramePrivate(browserTabId, browserFrameId);
        assert.isOk(frame, 'expectInitToken(): the given browserTabId and browserFrameId combination has not been registered');
        frame.pendingInitTokens.add(initToken);
    }

    markInitialized(browserTabId, browserFrameId, initToken) {
        const frame = this._getFramePrivate(browserTabId, browserFrameId);
        assert.isOk(frame, 'markInitialized(): the given browserTabId and browserFrameId combination has not been registered');
        const wasInitialized = frame.initialized;
        const wasInitMarked = frame.initMarked;
        frame.initMarked = true;
        frame.pendingInitTokens.delete(initToken);

        if (!wasInitMarked) {
            frame.currentContentId = generateShortId();
        }

        if (frame.initialized) {
            if (!wasInitialized) {
                ++frame.initCount;
            }

            const {initCount} = frame;
            for (const resolver of this.waitForTabInitializationResolvers) {
                if (resolver.browserTabId === browserTabId &&
                    resolver.browserFrameId === browserFrameId &&
                    initCount >= resolver.expectedInitCount
                ) {
                    this.waitForTabInitializationResolvers.delete(resolver);
                    resolver.resolve();
                }
            }
        }

        return frame.initialized;
    }

    async waitForTabContentInitialization(browserTabId, browserFrameId) {
        const frame = this._getFramePrivate(browserTabId, browserFrameId);
        if (frame && frame.initialized) {
            return;
        }

        await this.waitForNextTabContentInitialization(browserTabId, browserFrameId);
    }

    async waitForNextTabContentInitialization(browserTabId, browserFrameId) {
        const frame = this._getFramePrivate(browserTabId, browserFrameId);
        const initCount = frame ? frame.initCount : 0;

        await new Promise(resolve => this.waitForTabInitializationResolvers.add({
            browserTabId,
            browserFrameId,
            resolve,
            expectedInitCount: initCount + 1,
        }));
    }

    async waitForTabUninitialization(browserTabId, browserFrameId) {
        const frame = this._getFramePrivate(browserTabId, browserFrameId);
        if (!frame || !frame.initialized) {
            return;
        }

        await new Promise(resolve => this.waitForTabUninitializationResolvers.add({
            browserTabId,
            browserFrameId,
            resolve,
        }));
    }

    markClosed(browserTabId) {
        const tab = this.tabsByBrowserId.get(browserTabId);
        if (!tab) {
            return;
        }

        tab.closed = true;
        this.markUninitialized(browserTabId, 0);
    }
}

module.exports = TabTracker;
