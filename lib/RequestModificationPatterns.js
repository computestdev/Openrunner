'use strict';
const {illegalArgumentError} = require('./scriptErrors');
const log = require('./logger')({
    hostname: 'background',
    MODULE: 'RequestModificationPatterns',
});

class RequestModificationPatterns {
    constructor({browserWebRequestEmitter, extraInfoSpec = [], browserWindowId, listener}) {
        this.browserWebRequestEmitter = browserWebRequestEmitter;
        this.extraInfoSpec = [...extraInfoSpec]; // clone, to avoid external modifications
        this.browserWindowId = browserWindowId;
        this.activeListeners = new Map(); // id -> function
        this.nextId = 1;

        // The WebRequest api uniquely identifies listeners by their function reference
        this.createListener = data => (...args) => listener(data, ...args);
    }

    add(patterns, data = null) {
        if (!Array.isArray(patterns) || !patterns.length) {
            throw illegalArgumentError('RequestModificationPatterns.add(): Argument `patterns` must be an non empty array of strings');
        }

        for (const pattern of patterns) {
            if (typeof pattern !== 'string') {
                throw illegalArgumentError('RequestModificationPatterns.add(): Argument `patterns` must be an non empty array of strings');
            }
        }

        const id = this.nextId++;
        const listener = this.createListener(data);
        const {browserWindowId} = this;
        this.activeListeners.set(id, listener);
        log.info({id, browserWindowId, patterns}, 'Adding listener');

        this.browserWebRequestEmitter.addListener(listener, {urls: patterns, windowId: browserWindowId}, this.extraInfoSpec);
        return id;
    }

    remove(id) {
        if (typeof id !== 'number' || !this.activeListeners.has(id)) {
            return false;
        }

        const listener = this.activeListeners.get(id);
        log.info({id}, 'Removing listeners');

        this.browserWebRequestEmitter.removeListener(listener);
        this.activeListeners.delete(id);
        return true;
    }

    removeAll() {
        for (const listener of this.activeListeners.values()) {
            this.browserWebRequestEmitter.removeListener(listener);
        }
        this.activeListeners.clear();
    }
}

module.exports = RequestModificationPatterns;
