'use strict';
const EventEmitter = require('events').EventEmitter;

const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'tabs/background/ScriptWindow'});

class ScriptWindow extends EventEmitter {
    constructor(browserWindows, browserTabs) {
        super();
        this.browserWindows = browserWindows;
        this.browserTabs = browserTabs;
        this.openPromise = null;
        this.firstTabCreation = true;
        this.closed = false;
        Object.seal(this);
    }

    async open() {
        if (this.closed || this.openPromise) {
            throw Error('Invalid state');
        }

        this.firstTabCreation = true;
        this.openPromise = this.browserWindows.create({
            // focused: true,
            incognito: true,
            state: 'maximized',
            url: 'about:blank',
        }).then(window => window.id);

        const browserWindowId = await this.openPromise;
        this.emit('windowCreated', {browserWindowId});
    }

    get isOpen() {
        return Boolean(this.openPromise);
    }

    async getBrowserWindowId() {
        if (!this.openPromise) {
            await this.open();
        }

        return await this.openPromise;
    }

    async getBrowserWindow() {
        const browserWindowId = await this.getBrowserWindowId();
        return await this.browserWindows.get(browserWindowId, {
            populate: true,
            windowTypes: ['normal'],
        });
    }

    async close() {
        this.closed = true;
        if (!this.openPromise) {
            return;
        }

        const browserWindowId = await this.getBrowserWindowId();
        log.info({browserWindowId}, 'Closing our script window');
        await this.browserWindows.remove(browserWindowId);
        this.emit('windowClosed', {browserWindowId});
    }

    async createTab(url) {
        if (this.closed) {
            throw Error('Invalid state');
        }

        const {id: browserWindowId} = await this.getBrowserWindow();
        const tab = await this.browserTabs.create({
            active: true,
            windowId: browserWindowId,
            url,
        });

        if (this.firstTabCreation) {
            this.firstTabCreation = false;
            const {tabs: windowTabs} = await this.getBrowserWindow();

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
}


module.exports = ScriptWindow;
