'use strict';

const extendStack = require('../../../../lib/extendStack');
const tabClass = require('./Tab');

openRunnerRegisterRunnerModule('tabs', async ({script}) => {
    const Tab = tabClass(script);
    // note: currently items are never removed from this map, even if a tab is closed
    // this is fine for now because scripts are short lived
    const tabs = new Map(); // id -> Tab

    const create = async url => {
        return extendStack(async () => {
            const id = await script.rpcCall('tabs.create', {url});
            const tab = new Tab(id);
            tabs.set(id, tab);
            return tab;
        });
    };

    return {
        create,
    };
});
