'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'httpEvents/background/index'});
const TrackHttpEvents = require('./TrackHttpEvents');

const scriptEnvUrl = browser.extension.getURL('/build/httpEvents-script-env.js');

module.exports = async script => {
    const runResultModule = await script.include('runResult');
    const tracker = new TrackHttpEvents({
        runResult: runResultModule.scriptResult,
        browserWebRequest: browser.webRequest,
    });
    tracker.attach();

    script.on('tabs.windowCreated', async ({browserWindowId}) => {
        try {
            tracker.attachToBrowserWindow(browserWindowId);
        }
        catch (err) {
            log.error({err}, 'Error during script.windowCreated');
        }
    });

    const handleRunEnd = async () => tracker.detach();

    script.on('core.runEnd', wait => wait(handleRunEnd()));
    script.importScripts(scriptEnvUrl);
};
