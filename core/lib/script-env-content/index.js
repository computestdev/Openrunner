'use strict';
/* global window:false */
const ContentRPC = require('../../../lib/contentRpc/ContentRPC');
const log = require('../../../lib/logger')({hostname: 'script-env-content', MODULE: 'core/script-env-content/index'});

log.debug('Initializing...');
try {
    if (window.scriptEnvContentInitialized) {
        throw Error('Already initialized!');
    }
    window.scriptEnvContentInitialized = true;

    let worker = null;
    const rpc = new ContentRPC({
        browserRuntime: browser.runtime,
        context: 'core/script-env-content',
    });

    rpc.attach();
    rpc.method('workerCreate', ({url}) => {
        if (worker) {
            throw Error('A worker already exists');
        }

        worker = new Worker(url, {name: 'Openrunner script environment'});
        worker.onmessage = e => {
            rpc.callAndForget('workerMessage', e.data);
        };
    });

    rpc.method('workerPostMessage', (object) => {
        worker.postMessage(object);
    });

    rpc.method('workerTerminate', (object) => {
        worker.terminate();
        worker = null;
    });

    log.debug('Initialized... Notifying the background script');
    rpc.callAndForget('initialized');
}
catch (err) {
    log.error({err}, 'Error during initialization');
}
