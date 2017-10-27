'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'httpEvents/background/index'});
const TrackHttpEvents = require('./TrackHttpEvents');

const scriptEnvUrl = browser.extension.getURL('/build/httpEvents-script-env.js');

module.exports = async script => {
    const scriptResultPromise = script.include('runResult');
    const trackers = new Map();

    script.on('tabs.windowCreated', async ({browserWindowId}) => {
        try {
            if (trackers.has(browserWindowId)) {
                log.error('Received a duplicate windowCreated event');
                return;
            }

            const {scriptResult} = await scriptResultPromise;
            const tracker = new TrackHttpEvents({
                runResult: scriptResult,
                browserWebRequest: browser.webRequest,
                browserWindowId,
            });
            tracker.attach();
            trackers.set(browserWindowId, tracker);
        }
        catch (err) {
            log.err({err}, 'Error during script.windowCreated');
        }
    });

    const handleRunEnd = async () => {
        for (const tracker of trackers.values()) {
            tracker.detach();
        }
    };

    script.on('core.runEnd', wait => wait(handleRunEnd()));
    script.importScripts(scriptEnvUrl);
};

// TODO: Use `chrome.devtools.network.onRequestFinished` when it gets implemented
// https://bugzilla.mozilla.org/show_bug.cgi?id=1311171
