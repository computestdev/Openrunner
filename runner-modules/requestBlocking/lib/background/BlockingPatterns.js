'use strict';
const log = require('../../../../lib/logger')({
    hostname: 'background',
    MODULE: 'requestBlocking/background/BlockingPatterns',
});

// The WebRequest api uniquely identifies listeners by their function reference
const createListener = () => () => ({cancel: true});

class BlockingPatterns {
    constructor({browserWebRequest, browserWindowId}) {
        this.browserWebRequest = browserWebRequest;
        this.browserWindowId = browserWindowId;
        this.activeListeners = new Map(); // id -> function
        this.nextId = 1;
    }

    add(patterns) {
        if (!Array.isArray(patterns) || !patterns.length) {
            throw new TypeError('add(): Argument `patterns` must be an non empty array of strings');
        }

        for (const pattern of patterns) {
            if (typeof pattern !== 'string') {
                throw new TypeError('add(): Argument `patterns` must be an non empty array of strings');
            }
        }

        const id = this.nextId++;
        const listener = createListener();
        const {browserWindowId} = this;
        this.activeListeners.set(id, listener);
        log.info({id, browserWindowId, patterns}, 'Adding block patterns');

        this.browserWebRequest.onBeforeRequest.addListener(listener, {urls: patterns, windowId: browserWindowId}, ['blocking']);
        return id;
    }

    remove(id) {
        if (typeof id !== 'number' || !this.activeListeners.has(id)) {
            return false;
        }

        const listener = this.activeListeners.get(id);
        log.info({id}, 'Removing block patterns');

        this.browserWebRequest.onBeforeRequest.removeListener(listener);
        this.activeListeners.delete(id);
        return true;
    }

    removeAll() {
        for (const listener of this.activeListeners.values()) {
            this.browserWebRequest.onBeforeRequest.removeListener(listener);
        }
        this.activeListeners.clear();
    }
}

module.exports = BlockingPatterns;
