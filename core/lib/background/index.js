'use strict';
const log = require('../../../lib/logger')({hostname: 'parent', MODULE: 'core/background/index'});
const BrowserAction = require('./BrowserAction');
const CnCClient = require('./CnCClient');
const cncMethods = require('./cncMethods');
const {cncLoopbackPort} = require('../../../lib/buildConfig');
const getRuntimeVersions = require('./runtimeVersions');

(async () => {
    try {
        log.info('Initializing...');
        const browserAction = new BrowserAction({
            browserBrowserAction: browser.browserAction,
            browserRuntime: browser.runtime,
            browserTabs: browser.tabs,
            browserWebNavigation: browser.webNavigation,
            browserDownloads: browser.downloads,
        });
        browserAction.attach();

        if (cncLoopbackPort > 0) {
            const runtimeVersions = await getRuntimeVersions({
                browserRuntime: browser.runtime,
            });
            const client = new CnCClient({
                host: 'localhost',
                port: cncLoopbackPort,
                runtimeVersions,
            });
            client.methods(cncMethods());
            client.start();
        }
    }
    catch (err) {
        log.error({err}, 'Error during initialization');
    }
})();
