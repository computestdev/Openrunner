'use strict';
const {generate: generateShortId} = require('shortid');
const SymbolTree = require('symbol-tree');
const {assert} = require('chai');

const log = require('./logger')({MODULE: 'TabContentTracker'});
const WaitForEvent = require('./WaitForEvent');

const frameTree = new SymbolTree();
const NULL_FRAME_ID = -1; // same as WebExtension
const TOP_FRAME_ID = 0;
/**
 * @template T
 * @param {Set<T>} input
 * @param {Iterable<T>} iterable
 * @return {Set<T>} (not a copy)
 */
const setAddAll = (input, iterable) => {
    for (const item of iterable) {
        input.add(item);
    }
    return input;
};

/**
 * @typedef {'WAITING_FOR_HELLO'|'WAITING_FOR_MAIN'|'WAITING_FOR_INIT_TOKENS'|'INITIALIZED'|'DESTROYED'} InstanceState
 */
/** @type {{[K in InstanceState]: K}} */
const INSTANCE_STATE = Object.freeze({
    /**
     * The initial state.
     * We have yet to receive the first hello RPC message from content. By calling
     * frameContentHello() the state transitions to WAITING_FOR_MAIN.
     *
     * Transitions to WAITING_FOR_MAIN or to DESTROYED.
     */
    WAITING_FOR_HELLO: 'WAITING_FOR_HELLO',

    /**
     * Waiting for the main initialization to complete, during this state
     * the caller can request to wait for further initialization steps by
     * calling frameExpectInitialization(). By calling frameMainInitializationComplete()
     * the state transitions to WAITING_FOR_INIT_TOKENS
     *
     * Transitions into WAITING_FOR_INIT_TOKENS, INITIALIZED or DESTROYED.
     */
    WAITING_FOR_MAIN: 'WAITING_FOR_MAIN',

    /**
     * Waiting all previously expected init tokens to be initialized.
     * Each init token that was previously passed to frameExpectInitialization()
     * must be be passed to frameCompleteInitialization() before the state
     * transitions to INITIALIZED
     *
     * Transitions into INITIALIZED or DESTROYED.
     */
    WAITING_FOR_INIT_TOKENS: 'WAITING_FOR_INIT_TOKENS',

    /**
     * All initialization is complete.
     *
     * Transitions into DESTROYED.
     */
    INITIALIZED: 'INITIALIZED',

    /**
     * The frame has been destroyed.
     * Transitioning into this state can happen at any time, by calling tabClosed() or frameBeforeNavigate()
     *
     * Can not transition into a different state.
     */
    DESTROYED: 'DESTROYED',
});

/**
 * @param {InstanceState} oldState
 * @param {InstanceState} newState
 * @return {boolean}
 */
const isValidInstanceStateTransition = (oldState, newState) => {
    if (newState === INSTANCE_STATE.WAITING_FOR_MAIN) {
        return oldState === INSTANCE_STATE.WAITING_FOR_HELLO;
    }
    else if (newState === INSTANCE_STATE.WAITING_FOR_INIT_TOKENS) {
        return oldState === INSTANCE_STATE.WAITING_FOR_MAIN;
    }
    else if (newState === INSTANCE_STATE.INITIALIZED) {
        return oldState === INSTANCE_STATE.WAITING_FOR_MAIN || oldState === INSTANCE_STATE.WAITING_FOR_INIT_TOKENS;
    }
    return newState === INSTANCE_STATE.DESTROYED;
};


/**
 * @typedef {{
 *     readonly frame: FramePublic;
 *     readonly contentToken: string;
 *     readonly state: InstanceState;
 * }} FrameContentInstancePublic
 */

class FrameContentInstance {
    /**
     * @param {Frame} frame
     * @param {string} contentToken
     */
    constructor(frame, contentToken) {
        const self = this;
        /** @type {Frame} */
        this.frame = frame;
        /** @type {string} */
        this.contentToken = contentToken;
        /** @type {InstanceState} */
        this.state = INSTANCE_STATE.WAITING_FOR_HELLO;
        /** @type {Set<string>} */
        this.pendingInitTokens = new Set();
        /** @type {FrameContentInstancePublic} */
        this.public = {
            get frame() {
                return self.frame.public;
            },
            get contentToken() {
                return self.contentToken;
            },
            get state() {
                return self.state;
            },
        };
        Object.freeze(this.public);
        Object.seal(this);
    }

    /**
     * @param {InstanceState} newState
     */
    setState(newState) {
        const oldState = this.state;
        /* istanbul ignore if */
        if (!isValidInstanceStateTransition(oldState, newState)) {
            throw Error(`FrameContentInstance#setState(): Invalid state transition from ${oldState} to ${newState}`);
        }
        this.state = newState;
    }

    /**
     *
     */
    hello() {
        this.setState(INSTANCE_STATE.WAITING_FOR_MAIN);
    }

    /**
     *
     */
    mainInitializationComplete() {
        if (this.pendingInitTokens.size > 0) {
            this.setState(INSTANCE_STATE.WAITING_FOR_INIT_TOKENS);
        }
        else {
            this.setState(INSTANCE_STATE.INITIALIZED);
        }
    }

    /**
     * @param {string} initToken
     */
    expectInitialization(initToken) {
        assert.strictEqual(
            this.state,
            INSTANCE_STATE.WAITING_FOR_MAIN,
            'FrameContentInstance#expectInitialization(): Invalid state',
        );
        this.pendingInitTokens.add(initToken);
    }

    /**
     * @param {string} initToken
     */
    completeInitialization(initToken) {
        assert.strictEqual(
            this.state,
            INSTANCE_STATE.WAITING_FOR_INIT_TOKENS,
            'FrameContentInstance#completeInitialization(): Invalid state',
        );
        const deleted = this.pendingInitTokens.delete(initToken);
        assert(
            deleted,
            'FrameContentInstance#completeInitialization(): The given initToken was not pending',
        );

        if (this.pendingInitTokens.size === 0) {
            this.setState(INSTANCE_STATE.INITIALIZED);
        }
    }
}


/**
 * @typedef {{
 *     readonly browserFrameId: number;
 *     allContentInstances(): IterableIterator<FrameContentInstancePublic>;
 *     contentInstanceById(id: string): FrameContentInstancePublic | null;
 *     readonly tab: TabPublic;
 *     readonly destroyed: boolean;
 *     readonly parentFrame: FramePublic | null;
 *     isChildOf(frame: FramePublic | null): boolean;
 *     readonly parentBrowserFrameId: number;
 *     readonly currentContentId: string;
 *     readonly initialized: boolean;
 *     readonly initializedContentInstance: FrameContentInstancePublic | null;
 *     readonly initializedContentToken: string | null;
 * }} FramePublic
 */

class Frame {
    /**
     * @param {Tab} tab
     * @param {number} browserFrameId
     */
    constructor(tab, browserFrameId) {
        const self = this;
        frameTree.initialize(this);
        /** @type {Tab} */
        this.tab = tab;
        /** @type {number} */
        this.browserFrameId = browserFrameId;
        /** @type {boolean} */
        this.destroyed = false;
        /**
         * @type {Map<string, FrameContentInstance>}
         * @private
         */
        this._contentInstancesMap = new Map();
        /**
         * The first content instance that completed initialization.
         * This is stored so that we do not start using a different
         * content instance if multiple happen to be initialized.
         * If this property is set, the frame is considered to be
         * initialized and thus usable for Openrunner scripts.
         * @type {FrameContentInstance | null}
         */
        this.initializedContentInstance = null;
        /**
         * A frame is considered to be "initialized" if at least one content instance is in the INITIALIZED state.
         * This counter tracks how often the frame transition between being initialized and not.
         * @type {number}
         */
        this.initializationTransitionCounter = 0;
        /**
         * An unique ID which represents a single frame-content instance. Navigating to a new URL resets this id.
         * @type {string}
         */
        this.currentContentId = generateShortId();

        this.childFrameTokenWait = new WaitForEvent(); // key is [frameToken]

        /**
         * @type {FramePublic}
         */
        this.public = {
            get browserFrameId() {
                return self.browserFrameId;
            },
            get destroyed() {
                return self.destroyed;
            },
            * allContentInstances() {
                for (const contentInstance of self._contentInstancesMap.values()) {
                    yield contentInstance.public;
                }
            },
            contentInstanceById(id) {
                const content = self._contentInstancesMap.get(id);
                return content ? content.public : null;
            },
            get tab() {
                return self.tab.public;
            },
            get parentFrame() {
                const parent = self.parentFrame;
                return parent ? parent.public : null;
            },
            get parentBrowserFrameId() {
                return self.parentBrowserFrameId;
            },
            isChildOf(otherFrame) {
                return Boolean(otherFrame && otherFrame.browserFrameId === self.parentBrowserFrameId);
            },
            get currentContentId() {
                return self.currentContentId;
            },
            get initialized() {
                return Boolean(self.initializedContentInstance);
            },
            get initializedContentInstance() {
                return self.initializedContentInstance ? self.initializedContentInstance.public : null;
            },
            get initializedContentToken() {
                return self.initializedContentInstance ? self.initializedContentInstance.contentToken : null;
            },
        };
        Object.freeze(this.public);
        Object.seal(this);
    }

    /**
     * @return {Frame | null}
     */
    get parentFrame() {
        return frameTree.parent(this);
    }

    /**
     * @return {number}
     */
    get parentBrowserFrameId() {
        const parent = this.parentFrame;
        return parent ? parent.browserFrameId : NULL_FRAME_ID;
    }

    /**
     * @param {string} contentToken
     * @return {FrameContentInstance}
     * @private
     */
    _createContentInstance(contentToken) {
        assert.isFalse(this._contentInstancesMap.has(contentToken), 'Frame#createContentInstance(): Given contentToken already exists');
        const content = new FrameContentInstance(this, contentToken);
        this._contentInstancesMap.set(contentToken, content);
        return content;
    }

    /**
     * @return {Set<string>} All of the destroyed instance tokens
     * @private
     */
    _destroyAllContentInstances() {
        const destroyedContentTokens = new Set(this._contentInstancesMap.keys());
        if (this.initializedContentInstance) {
            this.initializedContentInstance = null;
            ++this.initializationTransitionCounter;
        }
        for (const content of this._contentInstancesMap.values()) {
            content.setState(INSTANCE_STATE.DESTROYED);
        }
        this._contentInstancesMap.clear();
        return destroyedContentTokens;
    }

    /**
     * @return {{
     *     destroyedContentTokens: Set<string>;
     * }}
     */
    destroy() {
        const destroyedContentTokens = this._destroyAllContentInstances();
        this.destroyed = true;
        return {destroyedContentTokens};
    }

    /**
     * @return {{
     *     destroyedContentTokens: Set<string>;
     * }}
     */
    beforeNavigate() {
        const destroyedContentTokens = this._destroyAllContentInstances();
        this.currentContentId = generateShortId();
        return {destroyedContentTokens};
    }


    /**
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    contentHello(contentToken) {
        const content = this._createContentInstance(contentToken);
        content.hello();
        this._maybeSetInitialized(content);
        return content.public;
    }

    /**
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    mainInitializationComplete(contentToken) {
        const content = this._contentInstancesMap.get(contentToken);
        if (!content) {
            throw Error('Frame#mainInitializationComplete(): Unknown contentToken');
        }
        content.mainInitializationComplete();
        this._maybeSetInitialized(content);
        return content.public;
    }

    /**
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    expectInitialization(contentToken, initToken) {
        const content = this._contentInstancesMap.get(contentToken);
        if (!content) {
            throw Error('Frame#expectInitialization(): Unknown contentToken');
        }
        content.expectInitialization(initToken);
        return content.public;
    }

    /**
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    completeInitialization(contentToken, initToken) {
        const content = this._contentInstancesMap.get(contentToken);
        if (!content) {
            throw Error('Frame#completeInitialization(): Unknown contentToken');
        }
        content.completeInitialization(initToken);
        this._maybeSetInitialized(content);
        return content.public;
    }

    /**
     * @param {FrameContentInstance} content
     * @private
     */
    _maybeSetInitialized(content) {
        if (!this.initializedContentInstance && content.state === INSTANCE_STATE.INITIALIZED) {
            this.initializedContentInstance = content;
            ++this.initializationTransitionCounter;
        }
    }

    /**
     * @param {Frame} otherFrame
     * @return {boolean}
     */
    isChildOf(otherFrame) {
        return Boolean(otherFrame && otherFrame.browserFrameId === this.parentBrowserFrameId);
    }

    /**
     * @param {string} token
     * @return {Promise<Frame>} The child frame
     */
    async waitForChildFrameToken(token) {
        return await this.childFrameTokenWait.wait([String(token)]);
    }

    /**
     * @param {string} token
     * @param {Frame} childFrame
     */
    resolveChildFrameToken(token, childFrame) {
        assert.isTrue(childFrame.isChildOf(this), 'Frame#resolveChildFrameToken() was called with a frame that is not a child');
        this.childFrameTokenWait.resolve([String(token)], childFrame);
    }
}



/**
 * @typedef {{
 *     readonly id: string;
 *     readonly browserTabId: number;
 *     readonly closed: boolean;
 *     allFrames(): IterableIterator<FramePublic>;
 *     frameByBrowserId(browserFrameId: number): FramePublic | null;
 *     readonly topFrame: FramePublic | null;
 * }} TabPublic
 */

class Tab {
    /**
     * @param {string} id
     * @param {number} browserTabId
     */
    constructor(id, browserTabId) {
        const self = this;
        /** @type {string} */
        this.id = id;
        /** @type {number} */
        this.browserTabId = browserTabId;
        /**
         * @type {Map<number, Frame>}
         * @private
         */
        this._framesByBrowserIdMap = new Map();
        /**
         * Has this tab been closed?
         * @type {boolean}
         */
        this.closed = false;
        /** @type {TabPublic} */
        this.public = {
            get id() {
                return self.id;
            },
            get browserTabId() {
                return self.browserTabId;
            },
            get closed() {
                return self.closed;
            },
            * allFrames() {
                for (const frame of self._framesByBrowserIdMap.values()) {
                    yield frame.public;
                }
            },
            frameByBrowserId(browserFrameId) {
                const frame = self.frameByBrowserId(browserFrameId);
                return frame && frame.public;
            },
            get topFrame() {
                return this.frameByBrowserId(TOP_FRAME_ID);
            },
        };
        Object.freeze(this.public);
        Object.seal(this);
    }

    /**
     * @return {IterableIterator<Frame>}
     */
    allFrames() {
        return this._framesByBrowserIdMap.values();
    }

    /**
     * @return {IterableIterator<number>}
     */
    * allBrowserFrameIds() {
        for (const frame of this.allFrames()) {
            yield frame.browserFrameId;
        }
    }

    /**
     * @param {number} browserFrameId
     * @return {Frame | null}
     */
    frameByBrowserId(browserFrameId) {
        return this._framesByBrowserIdMap.get(browserFrameId) || null;
    }

    /**
     * @param {number} parentBrowserFrameId
     * @param {number} browserFrameId
     * @return {?Frame}
     * @private
     */
    createFrame(parentBrowserFrameId, browserFrameId) {
        assert.isFalse(this.closed, 'Tab#createFrame(): Tab is closed');
        assert.isFalse(this._framesByBrowserIdMap.has(browserFrameId), 'Tab#createFrame(): Given browserFrameId already exists');
        assert(browserFrameId >= 0, 'browserFrameId >= 0');
        const frame = new Frame(this, browserFrameId);

        // -1 is used by the WebExtension api to indicate that there is no parent
        if (parentBrowserFrameId >= 0) {
            const parent = this._framesByBrowserIdMap.get(parentBrowserFrameId);
            assert.isOk(parent, 'Tab#createFrame(): Given parentBrowserFrameId does not exist');
            frameTree.appendChild(parent, frame);
        }

        this._framesByBrowserIdMap.set(browserFrameId, frame);
        return frame;
    }

    /**
     * @param {number} browserFrameId
     * @param {object} options
     * @param {boolean} options.descendantsOnly If false the frame and its descendants for the given given
     *        browserFrameId is destroyed. If true, only the descendants.
     * @return {{
     *     destroyedContentTokens: Set<string>;
     * }}
     */
    destroyFrame(browserFrameId, {descendantsOnly}) {
        const topFrame = this.frameByBrowserId(browserFrameId);
        assert.isOk(topFrame, 'Tab#destroyFrame(): Unknown browserFrameId');

        /** @type {IterableIterator<Frame>} */
        const iterator = frameTree.treeIterator(topFrame);
        const destroyedContentTokens = new Set();

        for (const frame of iterator) {
            if (descendantsOnly && frame === topFrame) {
                continue;
            }

            const result = frame.destroy();
            setAddAll(destroyedContentTokens, result.destroyedContentTokens);
            this._framesByBrowserIdMap.delete(frame.browserFrameId);
            frameTree.remove(frame);
        }
        return {destroyedContentTokens};
    }

    /**
     * @return {{
     *     destroyedContentTokens: Set<string>;
     * }}
     */
    close() {
        const destroyedContentTokens = new Set();
        for (const frame of this.allFrames()) {
            frameTree.remove(frame);
            const result = frame.destroy();
            setAddAll(destroyedContentTokens, result.destroyedContentTokens);
        }
        this._framesByBrowserIdMap.clear();
        this.closed = true;
        return {destroyedContentTokens};
    }

    /**
     * @param {number} browserFrameId
     * @return {{
     *     destroyedContentTokens: Set<string>;
     * }}
     */
    frameBeforeNavigate(browserFrameId) {
        const frame = this._framesByBrowserIdMap.get(browserFrameId);
        const destroyedContentTokens = new Set();
        if (!frame) {
            // We have not seen this browserFrameId before, the frame is not initialized until we receive
            // frameContentHello. So there is nothing to do here
            return {destroyedContentTokens};
        }
        {
            const result = frame.beforeNavigate();
            setAddAll(destroyedContentTokens, result.destroyedContentTokens);
        }
        {
            // Destroy all descendant frames because the DOM tree containing iframes (and similar) will be removed now
            const result = this.destroyFrame(browserFrameId, {descendantsOnly: true});
            setAddAll(destroyedContentTokens, result.destroyedContentTokens);
        }
        return {destroyedContentTokens};
    }

    /**
     * @param {number[]} browserFrameAncestorIds
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    frameContentHello(browserFrameAncestorIds, contentToken) {
        let descendantFrame;

        for (let i = browserFrameAncestorIds.length - 1; i >= 0; --i) {
            const browserFrameId = browserFrameAncestorIds[i];
            const parentBrowserFrameId = i in browserFrameAncestorIds ? browserFrameAncestorIds[i + 1] : -1;
            assert(browserFrameId >= 0, 'browserFrameId >= 0');

            let frame = this.frameByBrowserId(browserFrameId);
            if (!frame) {
                frame = this.createFrame(parentBrowserFrameId, browserFrameId);
            }

            descendantFrame = frame;
        }

        /* istanbul ignore if */
        if (!descendantFrame) {
            throw Error('Should be unreachable');
        }

        return descendantFrame.contentHello(contentToken);
    }

    /**
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    frameMainInitializationComplete(browserFrameId, contentToken) {
        const frame = this._framesByBrowserIdMap.get(browserFrameId);
        if (!frame) {
            throw Error('Tab#frameMainInitializationComplete(): Unknown browserFrameId');
        }
        return frame.mainInitializationComplete(contentToken);
    }

    /**
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    frameExpectInitialization(browserFrameId, contentToken, initToken) {
        const frame = this._framesByBrowserIdMap.get(browserFrameId);
        if (!frame) {
            throw Error('Tab#frameExpectInitialization(): Unknown browserFrameId');
        }
        return frame.expectInitialization(contentToken, initToken);
    }

    /**
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    frameCompleteInitialization(browserFrameId, contentToken, initToken) {
        const frame = this._framesByBrowserIdMap.get(browserFrameId);
        if (!frame) {
            throw Error('Tab#frameCompleteInitialization(): Unknown browserFrameId');
        }
        return frame.completeInitialization(contentToken, initToken);
    }

    /**
     * @param {number} parentBrowserFrameId
     * @param {string} token
     * @return {Promise<Frame>} The browserFrameId of the child frame
     */
    async frameWaitForChildFrameToken(parentBrowserFrameId, token) {
        const parentFrame = this._framesByBrowserIdMap.get(parentBrowserFrameId);
        if (!parentFrame) {
            throw Error('Tab#frameWaitForChildFrameToken(): Unknown browserFrameId');
        }

        return await parentFrame.waitForChildFrameToken(token);
    }

    /**
     * @param {number} parentBrowserFrameId
     * @param {string} token
     * @param {number} childBrowserFrameId
     */
    frameResolveChildFrameToken(parentBrowserFrameId, token, childBrowserFrameId) {
        const parentFrame = this._framesByBrowserIdMap.get(parentBrowserFrameId);
        const childFrame = this._framesByBrowserIdMap.get(childBrowserFrameId);
        if (!parentFrame) {
            throw Error('Tab#frameResolveChildFrameToken(): Unknown parentBrowserFrameId');
        }
        if (!childFrame) {
            throw Error('Tab#frameResolveChildFrameToken(): Unknown childBrowserFrameId');
        }

        return parentFrame.resolveChildFrameToken(token, childFrame);
    }
}


/**
 * Keeps track of the state of tabs, frames in tabs and content scripts in frames based on various events.
 */
class TabContentTracker {
    constructor() {
        /**
         * @type {Map<number, Tab>}
         * @private
         */
        this._tabsByBrowserIdMap = new Map();
        /**
         *
         * @type {Map<string, Tab>}
         * @private
         */
        this._tabsByIdMap = new Map();
        /**
         * All the contentTokens that we have seen before, but are now obsolete.
         * This is used so that we do not accidentally parse messages from old
         * instances that were still in flight.
         * This assumes that a contentToken is unique between tabs and frames.
         * @type {Set<string>}
         * @private
         */
        this._oldContentInstances = new Set();

        /**
         * @type {Set<{
         *     browserTabId: number;
         *     browserFrameId: number;
         *     minimumCounter: number;
         *     onInit: (contentInstance: FrameContentInstance) => void;
         * } | {
         *     browserTabId: number;
         *     browserFrameId: number;
         *     minimumCounter: number;
         *     onDeinit: () => void;
         * }>}
         * @private
         */
        this._waitForInit = new Set();
        Object.seal(this);
    }

    /**
     * @param {number} browserTabId
     * @param {Set<number>} browserFrameIds
     * @private
     */
    _resolveInitListeners(browserTabId, browserFrameIds) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);

        for (const obj of this._waitForInit) {
            if (obj.browserTabId !== browserTabId || !browserFrameIds.has(obj.browserFrameId)) {
                continue;
            }

            const frame = tab && tab.frameByBrowserId(obj.browserFrameId);

            if (
                'onInit' in obj && // listener for init?
                frame && // frame created?
                frame.initializedContentInstance && // initialized?
                frame.initializationTransitionCounter >= obj.minimumCounter
            ) {
                this._waitForInit.delete(obj);
                obj.onInit(frame.initializedContentInstance);
            }
            else if (
                !('onInit' in obj) && // listener for deinit?
                (
                    !frame || // frame destroyed?
                    (
                        !frame.initializedContentInstance && // not initialized?
                        frame.initializationTransitionCounter >= obj.minimumCounter
                    )
                )
            ) {
                this._waitForInit.delete(obj);
                obj.onDeinit();
            }
        }
    }

    /**
     * @return {IterableIterator<TabPublic>}
     */
    * allTabs() {
        for (const tab of this._tabsByIdMap.values()) {
            yield tab.public;
        }
    }

    /**
     * @return {IterableIterator<FramePublic>}
     */
    * allFrames() {
        for (const tab of this._tabsByIdMap.values()) {
            yield* tab.public.allFrames();
        }
    }

    /**
     * @param {string} tabId
     * @return {TabPublic | null}
     */
    tabById(tabId) {
        const tab = this._tabsByIdMap.get(tabId);
        return tab ? tab.public : null;
    }

    /**
     * @param {number} browserTabId
     * @return {TabPublic | null}
     */
    tabByBrowserId(browserTabId) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        return tab ? tab.public : null;
    }

    /**
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @return {Frame | null}
     * @private
     */
    _frameByBrowserId(browserTabId, browserFrameId) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            return null;
        }

        return tab.frameByBrowserId(browserFrameId);
    }

    /**
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @return {FramePublic | null}
     */
    frameByBrowserId(browserTabId, browserFrameId) {
        const frame = this._frameByBrowserId(browserTabId, browserFrameId);
        return frame ? frame.public : null;
    }

    /**
     * Should be called whenever a tab, that should be tracked, has been created.
     * @param {number} browserTabId
     * @return {TabPublic}
     */
    tabCreated(browserTabId) {
        assert(!this._tabsByBrowserIdMap.get(browserTabId), 'TabContentTracker#tabCreated(): Given browserTabId has already been created');

        // This id is visible to openrunner scripts, the browserTabId is not.
        // This ensures that we can make changes without breaking existing scripts.
        /** @type {string} */
        const id = generateShortId();
        const tab = new Tab(id, browserTabId);
        this._tabsByIdMap.set(id, tab);
        this._tabsByBrowserIdMap.set(browserTabId, tab);
        return tab.public;
    }

    /**
     * Should be called whenever a tracked tab has been closed.
     * @param {number} browserTabId
     */
    tabClosed(browserTabId) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            return;
        }

        const {destroyedContentTokens} = tab.close();
        const deleted0 = this._tabsByBrowserIdMap.delete(browserTabId);
        assert.isTrue(deleted0);
        const deleted1 = this._tabsByIdMap.delete(tab.id);
        assert.isTrue(deleted1);
        setAddAll(this._oldContentInstances, destroyedContentTokens);
    }

    /**
     * Should be called whenever a frame is going to navigate away.
     * This corresponds with the browser.webNavigation.onBeforeNavigate event.
     *
     * @param {number} browserTabId
     * @param {number} browserFrameId
     */
    frameBeforeNavigate(browserTabId, browserFrameId) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameBeforeNavigate(): Unknown browserTabId');
        }

        // frameBeforeNavigate might remove some frames, so gather the list of all frame id's before we call it
        const browserFrameIds = new Set(tab.allBrowserFrameIds());
        const {destroyedContentTokens} = tab.frameBeforeNavigate(browserFrameId);
        setAddAll(this._oldContentInstances, destroyedContentTokens);
        this._resolveInitListeners(browserTabId, browserFrameIds);
    }

    /**
     * Should be called when we receive the very first RPC message from our content script.
     * Content scripts can be executed multiple times, the `contentToken` parameter can be
     * used to tell the different instances apart.
     *
     * The content instance will be marked as not initialized until
     * frameMainInitializationComplete() is called.
     * @param {number} browserTabId
     * @param {number[]} browserFrameAncestorIds The browserFrameId and the browserFrameId of all of its ancestors. Should be ordered
     *        descending by depth For example: `[321, 100, 0]` should be passed if the hello message was sent from frame 321,
     *        which has frame 100 as its parent, and frame 0 as the parent of frame 100.
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    frameContentHello(browserTabId, browserFrameAncestorIds, contentToken) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameContentHello(): Unknown browserTabId');
        }
        assert(browserFrameAncestorIds.length > 0, 'TabContentTracker#frameContentHello(): browserFrameAncestorIds is empty');

        assert(
            !this._oldContentInstances.has(contentToken),
            'TabContentTracker#frameContentHello(): The given contentToken belonged to a frame that was previously destroyed',
        );

        const result = tab.frameContentHello(browserFrameAncestorIds, contentToken);
        this._resolveInitListeners(browserTabId, new Set(tab.allBrowserFrameIds()));
        return result;
    }

    /**
     * Indicate that the content and background scripts for this frame content instance are ready with their
     * initialization.
     * The caller may use frameExpectInitialization() before calling frameMainInitializationComplete()
     * to indicate that there are other things which are necessary for initialization.
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @return {FrameContentInstancePublic}
     */
    frameMainInitializationComplete(browserTabId, browserFrameId, contentToken) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameContentHello(): Unknown browserTabId');
        }

        const result = tab.frameMainInitializationComplete(browserFrameId, contentToken);
        this._resolveInitListeners(browserTabId, new Set(tab.allBrowserFrameIds()));
        return result;
    }

    /**
     *
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    frameExpectInitialization(browserTabId, browserFrameId, contentToken, initToken) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameExpectInitialization(): Unknown browserTabId');
        }

        return tab.frameExpectInitialization(browserFrameId, contentToken, initToken);
    }

    /**
     *
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @param {string} contentToken
     * @param {string} initToken
     * @return {FrameContentInstancePublic}
     */
    frameCompleteInitialization(browserTabId, browserFrameId, contentToken, initToken) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameCompleteInitialization(): Unknown browserTabId');
        }

        const result = tab.frameCompleteInitialization(browserFrameId, contentToken, initToken);
        this._resolveInitListeners(browserTabId, new Set(tab.allBrowserFrameIds()));
        return result;
    }

    /**
     * @param {number} browserTabId
     * @param {number} parentBrowserFrameId
     * @param {string} token
     * @return {Promise<FramePublic>} The child frame
     */
    async frameWaitForChildFrameToken(browserTabId, parentBrowserFrameId, token) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameWaitForChildFrameToken(): Unknown browserTabId');
        }

        const frame = await tab.frameWaitForChildFrameToken(parentBrowserFrameId, token);
        return frame.public;
    }

    /**
     * @param {number} browserTabId
     * @param {number} parentBrowserFrameId
     * @param {string} token
     * @param {number} childBrowserFrameId
     */
    frameResolveChildFrameToken(browserTabId, parentBrowserFrameId, token, childBrowserFrameId) {
        const tab = this._tabsByBrowserIdMap.get(browserTabId);
        if (!tab) {
            throw Error('TabContentTracker#frameResolveChildFrameToken(): Unknown browserTabId');
        }

        return tab.frameResolveChildFrameToken(parentBrowserFrameId, token, childBrowserFrameId);
    }

    /**
     * @template T
     * @typedef {{
     *  (
     *      options: {
     *          onCancel: ((handleCancel: (retriesExhausted: boolean) => void) => void);
     *          contentInstance: FrameContentInstancePublic;
     *          attempt: number;
     *          attemptsLeft: number;
    *       },
     *  ): Promise<{value: T} | {retry: true}>
     * }} WhenInitializedCallback
     */

    /**
     * @template T
     * @param {number} browserTabId
     * @param {number} browserFrameId
     * @param {WhenInitializedCallback<T>} callback
     * @param {object} [options]
     * @param {number} [options.retryCount]
     * @param {boolean} [options.nextInitialization]
     * @return Promise<T>
     */
    async whenInitialized(browserTabId, browserFrameId, callback, {retryCount = 1, nextInitialization = false} = {}) {
        const getInitializationTransitionCounter = () => {
            const frame = this._frameByBrowserId(browserTabId, browserFrameId);
            return frame ? frame.initializationTransitionCounter : 0;
        };

        /**
         * @param {(contentInstance: FrameContentInstance) => void} callback
         * @param {number} minimumCounter
         * @return {() => void}
         */
        const onInit = (callback, minimumCounter) => {
            const obj = Object.freeze({
                browserTabId,
                browserFrameId,
                minimumCounter,
                onInit: callback,
            });
            this._waitForInit.add(obj);
            return () => { this._waitForInit.delete(obj); };
        };

        /**
         * @param {() => void} callback
         * @param {number} minimumCounter
         * @return {() => void}
         */
        const onDeinit = (callback, minimumCounter) => {
            const obj = Object.freeze({
                browserTabId,
                browserFrameId,
                minimumCounter,
                onDeinit: callback,
            });
            this._waitForInit.add(obj);
            return () => { this._waitForInit.delete(obj); };
        };

        return new Promise((resolve, reject) => {

            /**
             * @param {number} attemptIndex
             * @param {boolean} nextInitializationOnly
             */
            const attempt = (attemptIndex, nextInitializationOnly) => {
                const attemptsLeft = retryCount - attemptIndex; // attemptsLeft is including the current attempt
                const retriesExhausted = attemptsLeft <= 1;
                /** @type {Array<() => void>} */
                const cleanupCbs = [];
                /** @type {Array<(retriesExhausted: boolean) => void>} */
                const cancelCbs = [];
                /**
                 * @param {(retriesExhausted: boolean) => void} callback
                 */
                const onCancel = (callback) => { cancelCbs.push(callback); };
                let cancelled = false;
                let attemptingNext = false;
                const cancel = () => {
                    cancelled = true;
                    for (const callback of cancelCbs) {
                        try {
                            callback(retriesExhausted);
                        }
                        catch (err) {
                            log.error({err}, 'Uncaught error in onCancel handler');
                        }
                    }
                };

                const cleanup = () => {
                    for (const callback of cleanupCbs) {
                        callback();
                    }
                    cleanupCbs.length = 0;
                };

                const maybeAttempt = () => {
                    assert.isFalse(attemptingNext);
                    attemptingNext = true;
                    if (retriesExhausted) {
                        const err = Error('TabContentTracker#whenInitialized(): Retry attempts have been exhausted');
                        err.name = 'TabContentTrackerRetriesExhausted';
                        reject(err);
                    }
                    else {
                        attempt(attemptIndex + 1, false);
                    }
                };

                const transitionCounter = getInitializationTransitionCounter();

                /**
                 * @param {FrameContentInstance} contentInstance
                 */
                const handleInit = (contentInstance) => {
                    const options = {
                        onCancel,
                        contentInstance: contentInstance.public,
                        attempt: attemptIndex,
                        attemptsLeft,
                    };

                    Promise.resolve()
                    .then(() => callback(options))
                    .then((result) => {
                        if (cancelled) {
                            return;
                        }

                        if (result && 'retry' in result && result.retry === true) {
                            cancelCbs.length = 0;
                            // we don't actually have to do anything here except for making sure we do not invoke the cancel handlers
                            // (the callback is the thing that triggered the retry, so it already knows it should cancel stuff), we simply
                            // pretend that the promise is still pending
                        }
                        else {
                            cleanup();
                            resolve(result && 'value' in result ? result.value : undefined);
                        }
                    })
                    .catch(err => {
                        if (cancelled) {
                            log.error({err}, 'Cancelled callback rejected with an error');
                            return;
                        }

                        cleanup();
                        reject(err);
                    });
                };

                const handleDeinit = () => {
                    cleanup();
                    cancel();
                    maybeAttempt();
                };

                const frame = this._frameByBrowserId(browserTabId, browserFrameId);
                if (frame && frame.initializedContentInstance) {
                    // Currently initialized

                    if (nextInitializationOnly) {
                        cleanupCbs.push(onInit(handleInit, transitionCounter + 1));
                        cleanupCbs.push(onDeinit(handleDeinit, transitionCounter + 2));
                    }
                    else {
                        Promise.resolve(frame.initializedContentInstance).then(handleInit);
                        cleanupCbs.push(onDeinit(handleDeinit, transitionCounter + 1));
                    }
                }
                else {
                    // Currently not initialized
                    cleanupCbs.push(onInit(handleInit, transitionCounter + 1));
                    cleanupCbs.push(onDeinit(handleDeinit, transitionCounter + 2));
                }
            };

            attempt(0, nextInitialization);
        });
    }
}

module.exports = {
    TabContentTracker,
};
