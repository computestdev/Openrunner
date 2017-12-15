'use strict';
const {describe, specify} = require('mocha-sugar-free');
require('chai').use(require('chai-subset'));
const {assert: {ok, match}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe('integration/requestBlocking', {timeout: 60000, slow: 10000}, () => {
    specify('Argument validation', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const requestBlocking = await include('requestBlocking');

            const result = await requestBlocking.block(123).catch(err => err);
            assert.instanceOf(result, Error);
            assert.match(result.message, /invalid.*pattern/i);
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Blocking of the main document request', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const requestBlocking = await include('requestBlocking');
            const tab = await tabs.create();

            await requestBlocking.block('http://localhost/headers/html');

            await tab.navigate(injected.url, {timeout: '2s'});
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        ok(result.error, 'expected an error');
        match(result.error.message, /Navigating.*localhost:\d+\/headers\/html.*time.*out/i);
    });

    specify('Blocking of a resource', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            await include('wait');
            const requestBlocking = await include('requestBlocking');
            const tab = await tabs.create();

            await requestBlocking.block(['http://localhost/static/foo.jpg*']);

            await tab.navigate(injected.url, {timeout: '2s'});
            await tab.wait(async () => {
                await wait.documentComplete();
            });
            await tab.run(async () => {
                const images = [...document.querySelectorAll('img')];
                assert.lengthOf(images, 3);

                for (const image of images) {
                    assert.isTrue(image.complete);
                    assert.strictEqual(image.naturalWidth, 0);
                    assert.strictEqual(image.naturalHeight, 0);
                    // if the image has loaded properly, its dimensions are 906x775
                    // if the image is very small, a broken image indicator is being displayed
                    assert.isBelow(image.clientWidth, 100);
                    assert.isBelow(image.clientHeight, 100);
                }
            });
        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Blocking of a fetch request', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            const requestBlocking = await include('requestBlocking');
            const tab = await tabs.create();

            await requestBlocking.block('http://localhost/headers/json');

            await tab.navigate(injected.url, {timeout: '2s'});

            await tab.run(async () => {
                const fetchPromise = content.fetch(`http://${location.host}/headers/json`, {cache: 'no-cache'});
                await assert.isRejected(fetchPromise, /NetworkError.*fetch/i);
            });
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Temporary blocking of a fetch request', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            const requestBlocking = await include('requestBlocking');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '2s'});

            await requestBlocking.block('http://localhost/headers/json', async () => {
                await tab.run(async () => {
                    const fetchPromise = content.fetch(`http://${location.host}/headers/json`, {cache: 'no-cache'});
                    await assert.isRejected(fetchPromise, /NetworkError.*fetch/i);
                });
            });
            await tab.run(async () => {
                const response = await content.fetch(`http://${location.host}/headers/json`, {cache: 'no-cache'});
                assert.ok(response.ok);
            });
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });
});
