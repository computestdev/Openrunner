'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'httpEvents/background/index'});
const maxTextLengthWithEllipsis = require('../../../../lib/maxTextLengthWithEllipsis');
const urlForShortTitle = require('../../../../lib/urlForShortTitle');

const ERROR_SHORT_TITLE_MAX_LENGTH = 64;

const filterExtensionUrl = url => (url && /^moz-extension:/.test(url) ? null : url);

class TrackHttpEvents {
    constructor({runResult, browserWebRequest, browserWindowId}) {
        this.runResult = runResult;
        this.browserWebRequest = browserWebRequest;
        this.browserWindowId = browserWindowId;
        this.handleBeforeRequest = this.handleBeforeRequest.bind(this);
        this.handleSendHeaders = this.handleSendHeaders.bind(this);
        this.handleHeadersReceived = this.handleHeadersReceived.bind(this);
        this.handleBeforeRedirect = this.handleBeforeRedirect.bind(this);
        this.handleResponseStarted = this.handleResponseStarted.bind(this);
        this.handleCompleted = this.handleCompleted.bind(this);
        this.handleErrorOccurred = this.handleErrorOccurred.bind(this);
        this.events = new Map(); // requestId -> {parentEvent, pendingSendRequestEvent, pendingReceiveResponseEvent}
        Object.freeze(this);
    }

    attach() {
        const filter = {
            urls: ['*://*/*'], // all http and https requests
            windowId: this.browserWindowId,
        };

        this.browserWebRequest.onBeforeRequest.addListener(this.handleBeforeRequest, filter);
        this.browserWebRequest.onSendHeaders.addListener(this.handleSendHeaders, filter, ['requestHeaders']);
        this.browserWebRequest.onHeadersReceived.addListener(this.handleHeadersReceived, filter);
        this.browserWebRequest.onBeforeRedirect.addListener(this.handleBeforeRedirect, filter);
        this.browserWebRequest.onResponseStarted.addListener(this.handleResponseStarted, filter, ['responseHeaders']);
        this.browserWebRequest.onCompleted.addListener(this.handleCompleted, filter);
        this.browserWebRequest.onErrorOccurred.addListener(this.handleErrorOccurred, filter);
    }

    detach() {
        this.browserWebRequest.onBeforeRequest.removeListener(this.handleBeforeRequest);
        this.browserWebRequest.onSendHeaders.removeListener(this.handleSendHeaders);
        this.browserWebRequest.onHeadersReceived.removeListener(this.handleHeadersReceived);
        this.browserWebRequest.onBeforeRedirect.removeListener(this.handleBeforeRedirect);
        this.browserWebRequest.onResponseStarted.removeListener(this.handleResponseStarted);
        this.browserWebRequest.onCompleted.removeListener(this.handleCompleted);
        this.browserWebRequest.onErrorOccurred.removeListener(this.handleErrorOccurred);
    }

    handleBeforeRequest({requestId, url, method, frameId, tabId, type, timeStamp, originUrl}) {
        // (may be fired multiple times per request)
        try {
            if (this.events.has(requestId)) {
                // redirect (TODO: test)
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
