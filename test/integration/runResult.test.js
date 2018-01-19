'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, isAtLeast, isAtMost, lengthOf}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe('integration/runResult', {timeout: 10000, slow: 5000}, () => {
    specify('Script transactions in the outer script and content', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});

            await transaction('First', async t => {
                t.title = 'The very first transaction!';
                await new Promise(resolve => setTimeout(resolve, 10));
                await tab.run(async () => {
                    await transaction('Second', async t => {
                        t.title = 'A transaction from content!';
                        await new Promise(resolve => setTimeout(resolve, 100));
                    });
                });
                await new Promise(resolve => setTimeout(resolve, 10));
            });
        }, {url: `http://localhost:${testServerPort()}/static/empty.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        lengthOf(result.result.transactions, 2);
        const [first, second] = result.result.transactions;

        eq(first.id, 'First');
        eq(first.title, 'The very first transaction!');
        eq(first.error, null);
        eq(second.id, 'Second');
        eq(second.title, 'A transaction from content!');
        eq(second.error, null);
        isAtLeast(first.timing.begin.time, result.result.timing.begin.time);
        isAtMost(first.timing.end.time, result.result.timing.end.time);
        isAtLeast(second.timing.begin.time, first.timing.begin.time);
        isAtMost(second.timing.end.time, first.timing.end.time);
    });
});
