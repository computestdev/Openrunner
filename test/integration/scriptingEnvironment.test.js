'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, deepEqual: deq}} = require('chai');

const {runScript, runScriptFromFunction, testServerPort} = require('./setupIntegrationTest');

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
            `return 123; //`,
        );
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
        eq(result.value, 123);
    });

    specify('Exposing the script api version', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            const {contentVersion} = await tab.run(async () => {
                return {
                    contentVersion: runMetadata.scriptApiVersion,
                };
            });

            return {
                contentVersion,
                scriptEnvVersion: include.scriptApiVersion,
            };

        }, {url: `http://localhost:${testServerPort()}/static/static.html?waitBeforeResponse=50&bytesPerSecond=100000`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        deq(result.value, {
            contentVersion: 1,
            scriptEnvVersion: 1,
        });
    });

    specify('Global fetch() function should not retain cookies in between script runs', async () => {
        const urlPrefix = `http://localhost:${testServerPort()}`;

        /* eslint-disable no-undef */
        const result0 = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const expect = await include('expect');
            {
                const response = await fetch(injected.urlPrefix + '/headers/set-cookie', {
                    credentials: 'include',
                });
                const body = await response.json();
                // should not yet have any cookies set
                expect(body.headers.cookie).to.equal(undefined);
            }

            {
                const response = await fetch(injected.urlPrefix + '/headers/json', {
                    credentials: 'include',
                });
                const body = await response.json();
                expect(body.headers.cookie.split(/\s*;\s*/).sort()).to.deep.equal(['bar=123', 'foo=123']);
            }


        }, {urlPrefix});
        /* eslint-enable no-undef */

        if (result0.error) {
            throw result0.error;
        }

        /* eslint-disable no-undef */
        const result1 = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const expect = await include('expect');

            const response = await fetch(injected.urlPrefix + '/headers/json', {
                credentials: 'include',
            });
            const body = await response.json();
            // should not have any cookies set because they were set in the previous script
            expect(body.headers.cookie).to.equal(undefined);
        }, {urlPrefix});
        /* eslint-enable no-undef */

        if (result1.error) {
            throw result1.error;
        }
    });
});
