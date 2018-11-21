/* global window, document */
'use strict';
const registerRunnerModule = require('../../../content-register');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'contentEvents/content/index'});

const SLOW_PAINT_THRESHOLD = 50; // 60hz = 16.6...ms

// Note: calling a stored copy of requestAnimationFrame results in errors intermittently
// So to avoid this bug we wrap the function
const requestAnimationFrame = callback => window.requestAnimationFrame(callback);
const timing = () => window.performance.timing;

registerRunnerModule('contentEvents', async ({getModule}) => {
    const {scriptResult, TimePoint} = await getModule('runResult');
    let lastAnimationFrame = null;

    const applyEventMetaData = event => {
        event.setMetaData('location', window.location.href);
        return event;
    };

    applyEventMetaData(scriptResult.timeEvent(
        'content:navigate',
        timing().navigationStart,
        timing().responseStart
    ));

    let interactiveEvent;
    let completeEvent;

    const handleReadyStateChange = () => {
        try {
            if (!interactiveEvent && (document.readyState === 'interactive' || document.readyState === 'complete')) {
                interactiveEvent = applyEventMetaData(scriptResult.timeEvent(
                    'content:documentInteractive',
                    timing().responseStart,
                    timing().domInteractive
                ));
            }

            if (!completeEvent && document.readyState === 'complete') {
                completeEvent = applyEventMetaData(scriptResult.timeEvent(
                    'content:documentComplete',
                    timing().domInteractive,
                    timing().domComplete
                ));
            }
        }
        catch (err) {
            log.error({err}, 'Error while handling readystatechange');
        }
    };

    const handleAnimationFrame = () => {
        const animationFrame = new TimePoint();
        const previousAnimationFrame = lastAnimationFrame;
        lastAnimationFrame = animationFrame;
        requestAnimationFrame(handleAnimationFrame);

        try {
            const frameDuration = animationFrame.diff(previousAnimationFrame);

            if (frameDuration >= SLOW_PAINT_THRESHOLD) {
                scriptResult.timePointEvent('content:slowAnimationFrame', previousAnimationFrame, animationFrame);
            }
        }
        catch (err) {
            log({err}, 'uncaught while handling animation frame');
        }
    };

    document.addEventListener('readystatechange', handleReadyStateChange);
    requestAnimationFrame(handleAnimationFrame);
    handleReadyStateChange();

    return {};
});
