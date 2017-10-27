'use strict';
/* global window:false, performance:false */
const Bluefox = require('bluefox');

const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'wait/content/index'});
const trackRunResultEvents = require('./trackRunResultEvents');

openRunnerRegisterRunnerModule('wait', async ({eventEmitter, getModule}) => {
    const runResultModule = await getModule('runResult');
    const bluefox = new Bluefox();
    const wait = bluefox.target(window).notThenable();

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

    return wait;
});
