'use strict';
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'tabs/content/contentUnloadEvent'});

module.exports = (emitter) => {
    let isUnloading = false;

    const fireContentUnloadEvent = () => {
        if (isUnloading) {
            return;
        }

        isUnloading = true;
        log.debug('Emitting tabs.beforeContentUnload...');
        emitter.emit('tabs.beforeContentUnload');
        log.debug('Emitted beforeContentUnload; Emitting tabs.contentUnload...');
        emitter.emit('tabs.contentUnload');
        log.debug('Emitted tabs.beforeContentUnload and tabs.contentUnload');
    };

    return fireContentUnloadEvent;
};
