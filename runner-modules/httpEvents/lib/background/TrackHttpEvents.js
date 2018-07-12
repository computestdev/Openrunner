'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'httpEvents/background/index'});
const maxTextLengthWithEllipsis = require('../../../../lib/maxTextLengthWithEllipsis');
const urlForShortTitle = require('../../../../lib/urlForShortTitle');
const WebExtListeners = require('../../../../lib/WebExtListeners');
const {SCRIPT_ENV: CORE_SCRIPT_ENV_URL} = require('../../../../core/lib/urls');

const ERROR_SHORT_TITLE_MAX_LENGTH = 64;
const filterExtensionUrl = url => (url && /^moz-extension:/.test(url) ? null : url);

class TrackHttpEvents {
    constructor({runResult, browserWebRequest}) {
        this.runResult = runResult;
        this.browserWebRequest = browserWebRequest;
        this._webRequestListeners = new WebExtListeners(this.browserWebRequest, this);
        this.events = new Map(); // requestId -> {parentEvent, pendingSendRequestEvent, pendingReceiveResponseEvent}
        this._attachedBrowserWindows = new Set();
        this._attached = false;
        Object.seal(this);
    }

    attach() {
        if (this._attached) {
            throw Error(`TrackHttpEvents: Already attached`);
        }
        this._attached = true;

        const scriptEnvFetchFilter = {
            urls: ['*://*/*'],
            tabId: -1,
        };
        this._attachToFilter(scriptEnvFetchFilter);
    }

    attachToBrowserWindow(browserWindowId) {
        if (this._attachedBrowserWindows.has(browserWindowId)) {
            throw Error(`TrackHttpEvents: Already attached to browserWindowId ${browserWindowId}`);
        }
        this._attachedBrowserWindows.add(browserWindowId);

        const filter = {
            urls: ['*://*/*'], // all http and https requests
            windowId: browserWindowId,
        };
        this._attachToFilter(filter);
    }

    _attachToFilter(filter) {
        const listeners = this._webRequestListeners;
        listeners.add('onBeforeRequest', this.handleBeforeRequest, filter);
        listeners.add('onSendHeaders', this.handleSendHeaders, filter, ['requestHeaders']);
        listeners.add('onHeadersReceived', this.handleHeadersReceived, filter);
        listeners.add('onBeforeRedirect', this.handleBeforeRedirect, filter);
        listeners.add('onResponseStarted', this.handleResponseStarted, filter, ['responseHeaders']);
        listeners.add('onCompleted', this.handleCompleted, filter);
        listeners.add('onErrorOccurred', this.handleErrorOccurred, filter);
    }

    detach() {
        this._webRequestListeners.cleanup();
        this._attachedBrowserWindows.clear();
        this._attached = false;
    }

    // (may be fired multiple times per request)
    handleBeforeRequest({requestId, url, method, frameId, tabId, type, timeStamp, originUrl, documentUrl}) {
        try {
            if (this.events.has(requestId)) {
                // redirect (TODO: test)
                return;
            }

            // tabId = -1 means the request is from an extension / internal / etc and this is something that
            // should be filtered.
            // However if the originUrl or documentUrl matches the URL to our main script-env file, it means
            // that the request was triggered by a fetch() request in the script (in the Worker)
            if (tabId === -1 && originUrl !== CORE_SCRIPT_ENV_URL && documentUrl !== CORE_SCRIPT_ENV_URL) {
                this.events.set(requestId, Object.freeze({filtered: true}));
                return;
            }

            const parentEvent = this.runResult.timeEvent('http', timeStamp, null);
            this.events.set(requestId, Object.seal({
                parentEvent,
                pendingSendRequestEvent: null,
                pendingReceiveResponseEvent: null,
            }));

            parentEvent.longTitle = `${method} ${url}`;
            parentEvent.shortTitle = `${method} ${urlForShortTitle(url)}`;
            parentEvent.setMetaData('url', url);
            parentEvent.setMetaData('finalUrl', url);
            parentEvent.setMetaData('method', method);
            parentEvent.setMetaData('frameId', frameId);
            parentEvent.setMetaData('tabId', tabId);
            parentEvent.setMetaData('type', type);
            parentEvent.setMetaData('originUrl', filterExtensionUrl(originUrl));
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onBeforeRequest');
        }
    }

    handleSendHeaders({requestId, url, requestHeaders, timeStamp}) {
        // (may be fired multiple times per request)
        try {
            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {parentEvent} = eventData;
            eventData.pendingSendRequestEvent = eventData.parentEvent.childTimeEvent('http:sendRequest', timeStamp, null);
            parentEvent.setMetaData('requestHeaders', requestHeaders);
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onSendHeaders');
        }
    }

    handleHeadersReceived({requestId, url, timeStamp}) {
        // (may be fired multiple times per request)
        try {
            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {pendingSendRequestEvent} = eventData;
            eventData.pendingSendRequestEvent = null;
            if (pendingSendRequestEvent) {
                pendingSendRequestEvent.timing.endAtTime(timeStamp);
            }
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onHeadersReceived');
        }
    }

    handleBeforeRedirect({requestId, url, timeStamp, ip, fromCache, statusCode, redirectUrl, statusLine}) {
        // (may be fired multiple times per request)
        try {
            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {parentEvent} = eventData;
            const childEvent = parentEvent.childTimeEvent('http:redirect', timeStamp, timeStamp);
            childEvent.setMetaData('ip', ip);
            childEvent.setMetaData('fromCache', fromCache);
            childEvent.setMetaData('statusCode', statusCode);
            childEvent.setMetaData('redirectUrl', redirectUrl);
            childEvent.setMetaData('statusLine', statusLine);
            parentEvent.setMetaData('finalUrl', redirectUrl);
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onBeforeRedirect');
        }
    }

    handleResponseStarted({requestId, url, timeStamp, ip, fromCache, statusCode, redirectUrl, responseHeaders, statusLine}) {
        // (fired once per request)
        try {
            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {parentEvent} = eventData;
            parentEvent.setMetaData('ip', ip);
            parentEvent.setMetaData('fromCache', fromCache);
            parentEvent.setMetaData('statusCode', statusCode);
            parentEvent.setMetaData('redirectUrl', redirectUrl);
            parentEvent.setMetaData('responseHeaders', responseHeaders);
            parentEvent.setMetaData('statusLine', statusLine);

            eventData.pendingReceiveResponseEvent = parentEvent.childTimeEvent('http:receiveResponse', timeStamp, null);
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onResponseStarted');
        }
    }

    handleCompleted({requestId, url, timeStamp}) {
        // (fired once per request)
        try {
            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {parentEvent, pendingReceiveResponseEvent} = eventData;
            parentEvent.timing.endAtTime(timeStamp);
            if (pendingReceiveResponseEvent) {
                pendingReceiveResponseEvent.timing.endAtTime(timeStamp);
            }
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onCompleted');
        }
    }

    handleErrorOccurred({requestId, url, timeStamp, error, method, frameId, tabId, type, originUrl}) {
        try {
            if (!this.events.has(requestId)) {
                this.handleBeforeRequest({requestId, url, method, frameId, tabId, type, timeStamp, originUrl});
            }

            const eventData = this.events.get(requestId);
            if (eventData.filtered) { return; }

            const {parentEvent} = eventData;
            parentEvent.timing.endAtTime(timeStamp);
            parentEvent.setMetaData('error', error);
            const errorEvent = parentEvent.childTimeEvent('http:error', timeStamp, timeStamp);
            errorEvent.shortTitle = maxTextLengthWithEllipsis(`Error: ${error}`, ERROR_SHORT_TITLE_MAX_LENGTH);
            errorEvent.longTitle = `Error: ${error}`;
            errorEvent.setMetaData('error', error);
        }
        catch (err) {
            log.error({err, requestId, url}, 'Error during webRequest.onErrorOccurred');
        }
    }
}

module.exports = TrackHttpEvents;
