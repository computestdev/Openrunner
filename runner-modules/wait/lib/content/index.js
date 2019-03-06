'use strict';
/* global window:false */
const Bluefox = require('bluefox');

const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'wait/content/index'});
const trackRunResultEvents = require('./trackRunResultEvents');
const registerRunnerModule = require('../../../content-register');

registerRunnerModule('wait', async ({eventEmitter, getModule}) => {
    const runResultModule = await getModule('runResult');
    const bluefox = new Bluefox();
    const wait = bluefox.target(window);

    eventEmitter.on('tabs.initializedTabContent', () => {
        const drain = trackRunResultEvents(runResultModule, bluefox);
        eventEmitter.on('tabs.beforeContentUnload', () => {
            try {
                log.debug('Creating run result events...');
                drain();
            }
            catch (err) {
                log.error({err}, 'Error while creating runResult events');
            }
        });
    });

    return {
        scriptValue: metadata => {
            if (typeof metadata.waitBeginTime === 'number') {
                return wait.overrideStartTime(metadata.waitBeginTime);
            }
            if (typeof metadata.runBeginTime === 'number') {
                return wait.overrideStartTime(metadata.runBeginTime);
            }
            return wait;
        },
    };
});
