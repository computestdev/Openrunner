'use strict';
const log = require('../../../../lib/logger')({hostname: 'background', MODULE: 'screenshot/background/takeScreenshot'});

const takeScreenshot = async ({tabsModule, runResultModule, browserTabs, comment}) => {
    const {TimePoint, scriptResult} = runResultModule;
    const browserWindowId = await tabsModule.getScriptBrowserWindowId();

    const beginTimePoint = new TimePoint();
    log.debug('Taking screenshot...');
    const dataUrlString = await browserTabs.captureVisibleTab(browserWindowId, {
        format: 'jpeg',
        quality: 90,
    });
    const endTimePoint = new TimePoint();
    const event = scriptResult.timePointEvent('screenshot', beginTimePoint, endTimePoint);
    event.shortTitle = 'Screenshot';
    event.longTitle = 'Screenshot';
    // The data url is stored within its own object so that we can easily encode it with https://www.npmjs.com/package/msgpack5
    event.comment = comment || '';
    event.setMetaData('data', {
        data: dataUrlString,
        dataURL: true,
    });
    return event;
};

module.exports = takeScreenshot;
