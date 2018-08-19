/* global crypto */
'use strict';
const {illegalArgumentError} = require('../../../../lib/scriptErrors');
const parseTimeoutArgument = require('../../../../lib/parseTimeoutArgument');
const extendStack = require('../../../../lib/extendStack');
const initFrame = require('./Frame');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/tabsModule'});
const {CONTENT_RPC_TIMEOUT_ERROR, frameContentTimeoutError} = require('../../../../lib/scriptErrors');

const generateFrameToken = () => {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    let result = '';
    for (const byte of buf) {
        result += byte.toString(16).padStart(2, '0');
    }
    return result;
};

module.exports = ({eventEmitter, getModule, rpc}) => {
    const Frame = initFrame(rpc);
    const frameMapping = new WeakMap();
    const pendingFrameMappings = new Set();
    const sendToken = (window, frameToken) => {
        try {
            log.debug({frameToken}, 'Attempting to send frame token');
            window.postMessage({openrunnerTabsFrameToken: frameToken}, '*');
        }
        catch (err) {
            log.warn({err}, 'Failed to send frame to toke to child frame');
        }
    };

    eventEmitter.on('tabs.childFrameInitialized', () => {
        log.debug({size: pendingFrameMappings.size}, 'tabs.childFrameInitialized: sending frame tokens to pending mappings');
        // The background script has notified us that one of our child frames is navigating to a new document
        // This means that our previous postMessage might have gotten lost! (e.g. sent to about:blank, or sent
        // just before the iframe unloads). So try sending it again...
        for (const {window, frameToken} of pendingFrameMappings) {
            sendToken(window, frameToken);
        }
    });

    const getFrameContentWindow = elementOrWindow => {
        if (!elementOrWindow || typeof elementOrWindow !== 'object') {
            return {window: null, description: null};
        }

        if (typeof elementOrWindow.postMessage === 'function') {
            return {window: elementOrWindow, description: 'WindowProxy'};
        }

        if (typeof elementOrWindow.nodeName === 'string' &&
            elementOrWindow.nodeName.toUpperCase() === 'IFRAME' &&
            typeof elementOrWindow.contentWindow === 'object' &&
            typeof elementOrWindow.contentWindow.postMessage === 'function'
        ) {
            return {window: elementOrWindow.contentWindow, description: elementOrWindow.nodeName};
        }

        return {window: null, description: null};
    };

    const getFrame = async (elementOrWindow, {timeout = 30000} = {}) => {
        // todo support <object> and <frame>: objectElement.contentWindow is not available cross
        // origin (for contentWindow.postMessage), so we have to use the window.frames list and
        // somehow map it to the proper object.

        const {window, description} = getFrameContentWindow(elementOrWindow);
        if (!window) {
            throw illegalArgumentError('tabs.frame(): First argument must be an iframe DOM element or WindowProxy');
        }

        {
            const frame = frameMapping.get(window);
            if (frame) {
                return frame;
            }
        }

        const timeoutMs = parseTimeoutArgument(timeout);
        const frameToken = generateFrameToken();

        // 'tabs.waitForChildFrameToken' also marks the token as valid, any other token is not accepted
        log.debug({frameToken}, 'Waiting for frame token...');
        const waitForTokenPromise = rpc.call({timeout: timeoutMs, name: 'tabs.waitForChildFrameToken'}, frameToken);
        const pendingEntry = Object.freeze({window, frameToken});
        pendingFrameMappings.add(pendingEntry);
        try {
            sendToken(window, frameToken);

            return await extendStack(async () => {
                const frameId = await waitForTokenPromise;
                log.debug({frameToken, frameId}, 'Frame token has been received');

                const frame = new Frame(frameId);
                frameMapping.set(window, frame);
                return frame;
            });
        }
        catch (err) {
            if (err.name === CONTENT_RPC_TIMEOUT_ERROR) {
                throw frameContentTimeoutError(
                    `tabs.frame(): Waiting for the content document of <${description}> to become available ` +
                    `timed out after ${timeoutMs / 1000} seconds.`
                );
            }
            throw err;
        }
        finally {
            pendingFrameMappings.delete(pendingEntry);
        }
    };

    return Object.freeze({
        Frame,
        frame: getFrame,
    });
};
