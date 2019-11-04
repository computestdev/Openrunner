'use strict';
const {describe, specify} = require('mocha-sugar-free');
require('chai').use(require('chai-subset'));
const {assert: {containSubset, isUndefined, deepEqual: deq}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('./setupIntegrationTest');

describe('integration/requestModification', {timeout: 60000, slow: 10000}, () => {
    specify('Argument validation', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const requestModification = await include('requestModification');

            const result = await requestModification.modifyRequestHeaders(123, {}).catch(err => err);
            assert.instanceOf(result, Error);
            assert.match(result.message, /invalid.*pattern/i);

            const result2 = await requestModification.modifyRequestHeaders('http://example/*', {foo: 123}).catch(err => err);
            assert.instanceOf(result2, Error);
            assert.match(result2.message, /invalid.*header/i);

        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Modification of request headers', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('wait');
            const requestModification = await include('requestModification');
            const tab = await tabs.create();

            await requestModification.modifyRequestHeaders('http://localhost/headers/html', {
                'X-Foo': 'the foo header!', // a new header
                'User-Agent': 'Mozilla/5.0 Lizard/20100101 Vuurvosje/140.0', // a modified header
                'Accept-Encoding': null, // a removed header
            });

            await tab.navigate(injected.url, {timeout: '10s'});
            const requestHeaders = await tab.run(async () => {
                const headers = await wait.documentComplete().selector('#requestHeadersDisplay');
                return JSON.parse(headers.textContent);
            });
            return {requestHeaders};
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const {requestHeaders} = result.value;

        containSubset(requestHeaders, {
            'x-foo': 'the foo header!',
            'user-agent': 'Mozilla/5.0 Lizard/20100101 Vuurvosje/140.0',
        });
        isUndefined(requestHeaders['accept-encoding']);
    });

    specify('Temporary modification of request headers', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('wait');
            const requestModification = await include('requestModification');
            const tab = await tabs.create();

            const test = async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                return await tab.run(async () => {
                    const headers = await wait.documentComplete().selector('#requestHeadersDisplay');
                    return JSON.parse(headers.textContent)['x-foo'];
                });
            };

            const firstResult = await requestModification.modifyRequestHeaders(
                ['http://localhost/headers/html'],
                {'X-Foo': 'The foo header!!'},
                test,
            );
            const secondResult = await test();

            return [firstResult, secondResult];
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        deq(result.value, ['The foo header!!', null]);
    });

    specify('Modification of request headers in a content fetch request', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            await include('wait');
            const requestModification = await include('requestModification');
            const tab = await tabs.create();

            await requestModification.modifyRequestHeaders('http://localhost/headers/json', {
                'X-Foo': 'The FOO header!', // a new header
                'X-Bar': 'The BAR header!', // a modified header, original is from the user code
                Origin: 'https://example.com', // a modified header, and it is a "Forbidden header name"
                'Accept-Encoding': null, // a removed header
            });

            await tab.navigate(injected.url, {timeout: '10s'});
            const requestHeaders = await tab.run(async () => {
                // content.fetch() requires firefox >= 58
                const response = await content.fetch(`http://${location.host}/headers/json`, {
                    headers: {
                        'X-Bar': 'Original bar header!',
                    },
                    cache: 'no-cache',
                });
                assert(response.ok);
                return (await response.json()).headers;
            });
            return {requestHeaders};
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const {requestHeaders} = result.value;

        containSubset(requestHeaders, {
            'x-foo': 'The FOO header!',
            'x-bar': 'The BAR header!',
            origin: 'https://example.com',
        });
        isUndefined(requestHeaders['accept-encoding']);
    });

    specify('Modification of response headers', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            await include('wait');
            const requestModification = await include('requestModification');
            const tab = await tabs.create();

            await requestModification.modifyResponseHeaders('http://localhost/headers/json', {
                'X-NewHeader': 'A new header!', // a new header
                'X-Foo': 'The FOO header!', // a modifier header (was set by the server)
                'X-Bar': null, // a removed header,
            });

            await tab.navigate(injected.url, {timeout: '10s'});
            const responseHeaders = await tab.run(async () => {
                // content.fetch() requires firefox >= 58
                const response = await content.fetch(`http://${location.host}/headers/json`, {
                    cache: 'no-cache',
                });
                assert(response.ok);
                return [...response.headers].reduce((obj, [name, value]) => {
                    obj[name] = value;
                    return obj;
                }, {});
            });
            return {responseHeaders};
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const {responseHeaders} = result.value;

        containSubset(responseHeaders, {
            'x-newheader': 'A new header!',
            'x-foo': 'The FOO header!',
        });
        isUndefined(responseHeaders['x-bar']);
    });

    specify('Temporary Modification of response headers', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('assert');
            await include('wait');
            const requestModification = await include('requestModification');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});

            const test = async () => {
                return await tab.run(async () => {
                    // content.fetch() requires firefox >= 58
                    const response = await content.fetch(`http://${location.host}/headers/json`, {
                        cache: 'no-cache',
                    });
                    assert(response.ok);
                    return response.headers.get('X-NewHeader');
                });
            };

            const firstResult = await requestModification.modifyResponseHeaders(
                ['http://localhost/headers/json'],
                {'X-NewHeader': 'A new header!'},
                test,
            );
            const secondResult = await test();

            return [firstResult, secondResult];

        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        deq(result.value, ['A new header!', null]);
    });
});
