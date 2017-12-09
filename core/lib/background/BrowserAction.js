'use strict';
const log = require('../../../lib/logger')({hostname: 'parent', MODULE: 'core/background/BrowserAction'});
const ScratchpadRPC = require('./ScratchpadRPC');
const {SCRATCHPAD_HTML} = require('../scratchpad-content/urls');

class BrowserAction {
    constructor({browserBrowserAction, browserRuntime, browserTabs, browserWebNavigation, browserDownloads}) {
        this.scratchpadRPC = new ScratchpadRPC({browserRuntime, browserTabs, browserWebNavigation, browserDownloads});
        this.browserBrowserAction = browserBrowserAction;
        this.browserTabs = browserTabs;
        this.handleClick = this.handleClick.bind(this);
    }

    attach() {
        this.scratchpadRPC.attach();
        this.browserBrowserAction.onClicked.addListener(this.handleClick);
    }

    detach() {
        this.browserBrowserAction.onClicked.removeListener(this.handleClick);
        this.scratchpadRPC.detach();
    }

    async handleClick() {
        try {
            const activeTabs = await this.browserTabs.query({
                active: true,
                currentWindow: true,
            });
            for (const tab of activeTabs) {
                if (!/^about:(?:blank|newtab|home)$/.test(tab.url)) {
                    continue;
                }

                await this.browserTabs.update(tab.id, {
                    url: SCRATCHPAD_HTML,
                });
                return;
            }

            await this.browserTabs.create({
                url: SCRATCHPAD_HTML,
            });
        }
        catch (err) {
            log.error({err}, 'Error in browserAction click handler');
        }
    }
}

module.exports = BrowserAction;
