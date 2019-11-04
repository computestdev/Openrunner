'use strict';
const EventEmitter = require('events').EventEmitter;
const {assert} = require('chai');

const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/ScriptWindow'});
const {BLANK_HTML} = require('./urls');
const WaitForEvent = require('../../../../lib/WaitForEvent');

let containerNameCounter = 0;

class ScriptWindow extends EventEmitter {
    constructor({browserWindows, browserTabs, browserWebNavigation, browserContextualIdentities}) {
        super();
        this._attached = false;
        this.browserWindows = browserWindows;
        this.browserTabs = browserTabs;
        this.browserWebNavigation = browserWebNavigation;
        this.browserContextualIdentities = browserContextualIdentities;
        this.openPromise = null;
        this.firstTabCreation = true;
        this.closed = false;
        this._navigationCompletedWait = new WaitForEvent(); // key is [browserTabId]
        this._sizeMinusViewport = Object.freeze({width: 0, height: 0});
        this.handleWebNavigationCompleted = this.handleWebNavigationCompleted.bind(this);
        Object.seal(this);
    }

    attach() {
        this.browserWebNavigation.onCompleted.addListener(this.handleWebNavigationCompleted);
        this._attached = true;
    }

    detach() {
        this._attached = false;
        this.browserWebNavigation.onCompleted.removeListener(this.handleWebNavigationCompleted);
    }

    handleWebNavigationCompleted({tabId: browserTabId, frameId, url}) {
        try {
            log.debug({browserTabId, frameId, url}, 'browser.webNavigation.onCompleted');

            if (frameId || url === 'about:blank') { // frameId === 0 is top; otherwise it is an iframe
                return;
            }

            this._navigationCompletedWait.resolve([browserTabId]);
        }
        catch (err) {
            log.error({err}, 'Error in browser.webNavigation.onCompleted');
        }
    }

    async open() {
        if (this.closed || this.openPromise) {
            throw Error('Invalid state');
        }

        log.debug({}, 'Creating new window...');

        this.firstTabCreation = true;
        this.openPromise = (async () => {
            containerNameCounter = (containerNameCounter + 1) % Number.MAX_SAFE_INTEGER;

            const {cookieStoreId} = await this.browserContextualIdentities.create({
                // the name does not have to be unique, but this way we communicate
                // to the user that a new container is used every time.
                name: `openrunner-${containerNameCounter}`,
                color: 'pink',
                icon: 'pet',
            });

            try {
                const window = await this.browserWindows.create({
                    cookieStoreId,
                    state: 'normal',
                    url: 'about:blank',
                });

                const firstTabId = window.tabs[0].id;
                await this._navigateToBlankPage(firstTabId);

                return {
                    browserWindowId: window.id,
                    cookieStoreId,
                    firstTabId,
                };
            }
            catch (err) {
                await this.browserContextualIdentities.remove(cookieStoreId)
                .catch(err => log.error({err}, 'Error from browserContextualIdentities.remove()'));
                throw err;
            }
        })();

        const {browserWindowId, firstTabId} = await this.openPromise;
        await this._gatherBrowserWindowDetails(browserWindowId, firstTabId);

        // maximize after looking up the view port measurements in _gatherBrowserWindowDetails
        // otherwise we are off by a few pixels on windows
        await this.browserWindows.update(browserWindowId, {state: 'maximized'});

        log.debug({browserWindowId, firstTabId, sizeMinusViewport: this.sizeMinusViewport}, 'Created a new window');

        this.emit('windowCreated', {browserWindowId});
    }

    /**
     * Navigate to blank.html and wait for the load event
     * @param {string} tabId
     * @return {Promise<void>}
     * @private
     */
    async _navigateToBlankPage(tabId) {
        await this._navigationCompletedWait.wait([tabId], async () => {
            await this.browserTabs.update(tabId, {url: BLANK_HTML});
        });
    }

    /**
     * Navigate to an extension page and gather some statistics about the environment, such as the position of the viewport.
     * @param {string} browserWindowId
     * @param {string} firstTabId
     * @private
     */
    async _gatherBrowserWindowDetails(browserWindowId, firstTabId) {
        let sizeMinusViewport = [0, 0];
        try {
            [sizeMinusViewport] = await this.browserTabs.executeScript(firstTabId, {
                code: '([window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight])',
            });
        }
        catch (err) {
            log.debug({browserWindowId, firstTabId, err}, 'Unable to determine the window dimension');
        }

        this._sizeMinusViewport = Object.freeze({
            width: Number(sizeMinusViewport[0]),
            height: Number(sizeMinusViewport[1]),
        });
    }

    /**
     * @return {{width: number, height: number}}
     */
    get sizeMinusViewport() {
        return this._sizeMinusViewport;
    }

    get isOpen() {
        return Boolean(this.openPromise);
    }

    async getBrowserWindowId() {
        if (!this.openPromise) {
            await this.open();
        }

        const {browserWindowId} = await this.openPromise;
        return browserWindowId;
    }

    async getBrowserWindow() {
        const browserWindowId = await this.getBrowserWindowId();
        return await this.browserWindows.get(browserWindowId, {
            populate: true,
        });
    }

    async close() {
        this.closed = true;
        if (!this.openPromise) {
            return;
        }

        const {browserWindowId, cookieStoreId} = await this.openPromise;
        log.info({browserWindowId}, 'Closing our script window');
        await this.browserWindows.remove(browserWindowId);

        log.info({cookieStoreId}, 'Removing contextual identity');
        await this.browserContextualIdentities.remove(cookieStoreId);

        this.emit('windowClosed', {browserWindowId});
    }

    async createTab(url) {
        if (this.closed) {
            throw Error('Invalid state');
        }

        // opens the window if needed:
        const browserWindow = await this.getBrowserWindow();
        const {browserWindowId, cookieStoreId} = await this.openPromise;
        assert.strictEqual(browserWindow.id, browserWindowId);

        const tab = await this.browserTabs.create({
            active: true,
            windowId: browserWindowId,
            url,
            cookieStoreId,
        });

        if (this.firstTabCreation) {
            this.firstTabCreation = false;
            const {tabs: windowTabs} = browserWindow;

            if (windowTabs[0].id !== tab.id) {
                // remove the first blank tab. But do not wait for it, otherwise
                this.browserTabs.remove(windowTabs[0].id).catch(err => log.error({err}, 'Error while removing tab'));
            }
        }

        log.debug({browserTabId: tab.id, url}, 'Created a new tab');

        return tab;
    }

    async hasBrowserTab(browserTab) {
        const {id: browserWindowId} = await this.getBrowserWindow();
        return browserWindowId === browserTab.windowId;
    }

    async setWindowSize({width, height}) {
        const {id: browserWindowId} = await this.getBrowserWindow();
        await this.browserWindows.update(browserWindowId, {
            width: Number(width),
            height: Number(height),
        });

        const result = await this.browserWindows.get(browserWindowId);
        return Object.freeze({
            width: result.width,
            height: result.height,
        });
    }
}


module.exports = ScriptWindow;
