/* global window, document */
'use strict';

const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'contentEvents/content/index'});

const {performance, requestAnimationFrame} = window;
const SLOW_PAINT_THRESHOLD = 50; // 60hz = 16.6...ms

openRunnerRegisterRunnerModule('contentEvents', async ({getModule}) => {
    const {scriptResult, TimePoint} = await getModule('runResult');
    let lastAnimationFrame = null;

    const applyEventMetaData = event => {
        event.setMetaData('location', window.location.href);
        return event;
    };

    applyEventMetaData(scriptResult.timeEvent(
        'content:navigate',
        performance.timing.navigationStart,
        performance.timing.responseStart
    ));

    const handleReadyStateChange = () => {
        try {
            if (document.readyState === 'interactive') {
                applyEventMetaData(scriptResult.timeEvent(
                    'content:documentInteractive',
                    performance.timing.responseStart,
                    performance.timing.domInteractive
                ));
            }
            else if (document.readyState === 'complete') {
                applyEventMetaData(scriptResult.timeEvent(
                    'content:documentComplete',
                    performance.timing.domInteractive,
                    performance.timing.domComplete
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

    return {};
});
