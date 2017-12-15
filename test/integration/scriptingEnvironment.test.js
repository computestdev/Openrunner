'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq}} = require('chai');

const {runScript, runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe('integration/scriptingEnvironment', {timeout: 60000, slow: 10000}, () => {
    specify('Minimal script using only "transaction", "core" and "tabs"', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await transaction('First', async t => {
                t.title = '00 First';
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    document.documentElement.focus();
                });
            });
        }, {url: `http://localhost:${testServerPort()}/static/static.html?waitBeforeResponse=50&bytesPerSecond=100000`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
        eq(result.result.transactions.length, 1);
        eq(result.result.transactions[0].id, 'First');
        eq(result.result.transactions[0].title, '00 First');
        eq(result.result.transactions[0].error, null);
    });

    specify('Script ending with a line comment', async () => {
        /* eslint-disable no-undef */
        const result = await runScript(
            `'Openrunner-Script: v1';` +
            `return 123; //`
        );
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
        eq(result.value, 123);
    });
});
