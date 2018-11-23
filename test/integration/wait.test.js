'use strict';
const {describe, specify} = require('mocha-sugar-free');
require('chai').use(require('chai-subset'));
const {assert: {strictEqual: eq, lengthOf, isNumber, isAtLeast, isAtMost, isNull}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe('integration/wait', {timeout: 60000, slow: 10000}, () => {
    specify('Utility functions for the script-env', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const wait = await include('wait');

            const before = Date.now();
            await wait.delay(250);
            assert.approximately(Date.now() - before, 250, 50);
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Waiting for a wait expression', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const tabs = await include('tabs');
            const tab = await tabs.create();
            await include('wait');

            await transaction('Foo', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    assert.approximately(runMetadata.runBeginTime, Date.now(), 10000);
                    assert.strictEqual(wait.configuration.overrideStartTime, runMetadata.runBeginTime);

                    const waitExpression = wait.documentComplete().selector('img');
                    const firstImage = await waitExpression;

                    assert.isTrue(firstImage.complete);
                    assert.match(firstImage.src, /foo\.jpg/);
                });
            });
        }, {url: `http://localhost:${testServerPort()}/static/static.html?waitBeforeResponse=50`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const transaction = result.result.transactions[0];
        const events = result.result.events.filter(e => e.type === 'command:wait');
        lengthOf(events, 1);
        const event = events[0];
        eq(event.type, 'command:wait');
        eq(event.shortTitle, 'Wait for DOM condition');
        eq(
            event.longTitle,
            'The expression sets the target to <#window>, waits up to 30 seconds until all synchronous resources of the HTML document ' +
            'have been loaded, finds the first descendant element matching the CSS selector “img”, waits up to 30 seconds until a result ' +
            'is found.'
        );
        eq(event.metaData.failureReason, null);
        isNumber(event.metaData.checkCount);
        isAtLeast(event.metaData.checkCount, 1);
        isNumber(event.metaData.checkOverhead);
        isAtLeast(event.timing.begin.time, transaction.timing.begin.time);
        isAtMost(event.timing.end.time, transaction.timing.end.time);
        isAtLeast(transaction.timing.duration, 100);
    });

    specify('Failing a wait expression', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();
            await include('wait');

            await transaction('Foo', async t => {
                t.eatError = true;
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    await wait.timeout('1s').selector('img#doesNotExist');
                });
            });
        }, {url: `http://localhost:${testServerPort()}/static/static.html?waitBeforeResponse=50`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const transaction = result.result.transactions[0];
        eq(transaction.error.name, 'BluefoxTimeoutError');
        eq(
            transaction.error.message,
            'Wait expression timed out after 1 seconds because no results were found, instead of a minimum of 1 results. ' +
            'The expression sets the target to <#window>, finds the first descendant element matching the CSS selector ' +
            '“img#doesNotExist”, waits up to 1 seconds until a result is found.'
        );

        const events = result.result.events.filter(e => e.type === 'command:wait');
        lengthOf(events, 1);
        const event = events[0];

        eq(event.type, 'command:wait');
        eq(event.shortTitle, 'Wait for DOM condition');
        eq(
            event.longTitle,
            'The expression sets the target to <#window>, finds the first descendant element matching the CSS selector ' +
            '“img#doesNotExist”, waits up to 1 seconds until a result is found.'
        );
        eq(
            event.metaData.failureReason,
            'Wait expression timed out after 1 seconds because no results were found, instead of a minimum of 1 results. ' +
            'The expression sets the target to <#window>, finds the first descendant element matching the CSS selector ' +
            '“img#doesNotExist”, waits up to 1 seconds until a result is found.'
        );
        isAtLeast(event.timing.begin.time, transaction.timing.begin.time);
        isAtMost(event.timing.end.time, transaction.timing.end.time);
    });

    specify('Repeating the wait expression between navigations', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const tabs = await include('tabs');
            const tab = await tabs.create();
            const {delay} = await include('wait');

            let tabWaitResolved = false;
            let tabWaitPromise;

            await transaction('First', async () => {
                await tab.navigate(injected.firstUrl, {timeout: '10s'});

                tabWaitPromise = tab.wait(async () => {
                    assert.approximately(runMetadata.waitBeginTime, Date.now(), 10000);
                    assert.strictEqual(wait.configuration.overrideStartTime, runMetadata.waitBeginTime);

                    const waitExpression = wait.documentComplete().selector('img');
                    const firstImage = await waitExpression;

                    assert.isTrue(firstImage.complete);
                    assert.match(firstImage.src, /foo\.jpg/);
                    sessionStorage.reachedEndOfWait = true;
                })
                .then(() => { tabWaitResolved = true; });

                await delay(500);
                assert.isFalse(tabWaitResolved);
                assert.isFalse(await tab.run(() => Boolean(sessionStorage.reachedEndOfWait)));
            });
            await transaction('Second', async () => {
                await tab.navigate(injected.secondUrl, {timeout: '10s'});
                await delay(500);
                assert.isFalse(tabWaitResolved);
                assert.isFalse(await tab.run(() => Boolean(sessionStorage.reachedEndOfWait)));
            });
            await transaction('Third', async () => {
                await tab.navigate(injected.thirdUrl, {timeout: '10s'});
                await tabWaitPromise;
                assert.isTrue(await tab.run(() => Boolean(sessionStorage.reachedEndOfWait)));
            });
        }, {
            firstUrl: `http://localhost:${testServerPort()}/static/empty.html`,
            secondUrl: `http://localhost:${testServerPort()}/static/textOnly.html`,
            thirdUrl: `http://localhost:${testServerPort()}/static/static.html?waitBeforeResponse=50`,
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [firstTrans, secondTrans, thirdTrans] = result.result.transactions;
        const events = result.result.events.filter(e => e.type === 'command:wait');
        lengthOf(events, 3);


        isAtLeast(events[0].timing.begin.time, firstTrans.timing.begin.time);
        isAtMost(events[0].timing.begin.time, firstTrans.timing.end.time);
        isNull(events[0].timing.end);
        isNull(events[0].timing.duration);

        isAtLeast(events[1].timing.begin.time, secondTrans.timing.begin.time);
        isAtMost(events[1].timing.begin.time, secondTrans.timing.end.time);
        isNull(events[1].timing.end);
        isNull(events[1].timing.duration);

        isAtLeast(events[2].timing.begin.time, thirdTrans.timing.begin.time);
        isAtMost(events[2].timing.begin.time, thirdTrans.timing.end.time);
        isAtLeast(events[2].timing.end.time, thirdTrans.timing.begin.time);
        isAtMost(events[2].timing.end.time, thirdTrans.timing.end.time);
        isAtLeast(thirdTrans.timing.duration, 100);
    });
});
