'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, match, isAtLeast, isAtMost, lengthOf}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('./setupIntegrationTest');

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

    specify('Pending transactions should be marked with an error if the script ends', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            'Openrunner-Script-Timeout: 100';
            await transaction('First', async t => {
                await new Promise(() => {});
            });
        });
        /* eslint-enable no-undef */

        eq(result.error.name, 'Openrunner:ScriptExecutionTimeoutError');
        lengthOf(result.result.transactions, 1);
        const [transaction] = result.result.transactions;
        eq(transaction.error.name, 'Openrunner:TransactionAbortedError');
        match(transaction.error.message, /transaction.*abort.*script run.*end.*execution.*time.*out.*0.1 second/i);
    });

    specify('Pending content transactions should be marked with an error if the tab navigates away', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url + '?foo', {timeout: '10s'});
            await tab.run(async () => {
                transaction('First', async t => {
                    await new Promise(() => {});
                });
            });
            await tab.navigate(injected.url + '?bar', {timeout: '10s'});
        }, {url: `http://localhost:${testServerPort()}/static/empty.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        lengthOf(result.result.transactions, 1);
        const [transaction] = result.result.transactions;
        eq(transaction.error.name, 'Openrunner:TransactionAbortedError');
        match(transaction.error.message, /transaction.*abort.*page.*navigated/i);
    });
});
