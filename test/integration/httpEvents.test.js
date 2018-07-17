'use strict';
const {describe, specify, before} = require('mocha-sugar-free');
const {assert: {lengthOf, deepEqual: deq, strictEqual: eq, approximately, isAtLeast, isAtMost, isString}} = require('chai');
const {stat} = require('fs-extra');
const {join: pathJoin} = require('path');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

const httpEventFilter = e => e.type === 'http';
const httpEventNoFaviconFilter = e => httpEventFilter(e) && !/\/favicon.ico$/.test(e.metaData.url);

describe('integration/httpEvents', {timeout: 60000, slow: 20000}, () => {
    let STATIC_HTML_SIZE;
    let FOO_JPG_SIZE;

    before(async () => {
        [STATIC_HTML_SIZE, FOO_JPG_SIZE] = (await Promise.all([
            stat(pathJoin(__dirname, '..', 'server', 'static', 'static.html')),
            stat(pathJoin(__dirname, '..', 'server', 'static', 'foo.jpg')),
        ])).map(s => s.size);
    });

    specify('Tracking of simple http requests', async () => {
        const host = `localhost:${testServerPort()}`;
        const urlPrefix = `http://${host}/static`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const {delay} = await include('wait');
            await include('httpEvents');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await transaction('First', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    await wait.documentComplete();
                });
            });
            await delay('1s');

        }, {url: `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [transaction] = result.result.transactions;
        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 4);
        eq(events[0].metaData.url, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[1].metaData.url, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].metaData.url, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].metaData.url, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        eq(events[0].metaData.finalUrl, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[1].metaData.finalUrl, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].metaData.finalUrl, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].metaData.finalUrl, `${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        eq(events[0].metaData.method, 'GET');
        eq(events[1].metaData.method, 'GET');
        eq(events[2].metaData.method, 'GET');
        eq(events[3].metaData.method, 'GET');
        eq(events[0].metaData.type, 'main_frame');
        eq(events[1].metaData.type, 'image');
        eq(events[2].metaData.type, 'image');
        eq(events[3].metaData.type, 'image');
        eq(events[0].metaData.originUrl, null);
        eq(events[1].metaData.originUrl, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[2].metaData.originUrl, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[3].metaData.originUrl, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[0].longTitle, `GET ${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[1].longTitle, `GET ${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].longTitle, `GET ${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].longTitle, `GET ${urlPrefix}/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        eq(events[0].shortTitle, `GET static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
        eq(events[1].shortTitle, `GET foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].shortTitle, `GET foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].shortTitle, `GET foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        approximately(events[0].timing.duration, 50 + STATIC_HTML_SIZE / 100000 * 1000, 250);
        approximately(events[1].timing.duration, 50 + FOO_JPG_SIZE / 400000 * 1000, 250);
        approximately(events[2].timing.duration, 35 + FOO_JPG_SIZE / 300000 * 1000, 250);
        approximately(events[3].timing.duration, 60 + FOO_JPG_SIZE / 400000 * 1000, 250);
        deq(events[0].metaData.responseHeaders.filter(h => h.name === 'Content-Type'), [{
            name: 'Content-Type',
            value: 'text/html',
        }]);
        deq(events[1].metaData.responseHeaders.filter(h => h.name === 'Content-Type'), [{
            name: 'Content-Type',
            value: 'image/jpeg',
        }]);

        for (const event of events) {
            isAtLeast(event.timing.begin.time, transaction.timing.begin.time);
            isAtMost(event.timing.end.time, transaction.timing.end.time);
            Array.isArray(event.metaData.requestHeaders);
            deq(event.metaData.requestHeaders.filter(h => h.name === 'Host'), [{
                name: 'Host',
                value: host,
            }]);
            eq(event.metaData.ip, '127.0.0.1');
            eq(event.metaData.statusCode, 200);
            eq(event.metaData.fromCache, false);
            eq(event.metaData.redirectUrl, null);
            eq(event.metaData.statusLine, 'HTTP/1.1 200 OK');
        }
    });

    specify('Tracking of http redirects', async () => {
        const host = `localhost:${testServerPort()}`;
        const navigateUrl =
            `http://${host}/redirect/307?url=` +
            `${encodeURIComponent(`http://${host}/static/static.html?waitBeforeResponse=50`)}`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('wait');
            await include('httpEvents');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await transaction('First', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    await wait.documentComplete();
                });
            });

        }, {url: navigateUrl});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [transaction] = result.result.transactions;
        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 4);
        eq(events[0].metaData.url, navigateUrl, 'Should use the url of the first request');
        eq(events[1].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        eq(events[0].metaData.finalUrl, `http://${host}/static/static.html?waitBeforeResponse=50`);
        eq(events[1].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[2].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[3].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);

        const redirectedEvent = events[0];
        eq(redirectedEvent.longTitle, `GET ${navigateUrl}`);
        eq(redirectedEvent.metaData.type, 'main_frame');
        eq(redirectedEvent.metaData.statusCode, 200);

        const redirectChildEvents = redirectedEvent.children.filter(e => e.type === 'http:redirect');
        lengthOf(redirectChildEvents, 1);
        eq(redirectChildEvents[0].metaData.redirectUrl, `http://${host}/static/static.html?waitBeforeResponse=50`);
        eq(redirectChildEvents[0].metaData.statusCode, 307);
        eq(redirectChildEvents[0].metaData.statusLine, 'HTTP/1.1 307 Temporary Redirect');
        // todo test for redirectChildEvents[0].metaData.responseHeaders when that is supported by webRequest for redirects
    });

    specify('Tracking of JavaScript redirects', async () => {
        const host = `localhost:${testServerPort()}`;
        const navigateUrl =
            `http://${host}/redirect/html?url=` +
            `${encodeURIComponent(`http://${host}/static/static.html?waitBeforeResponse=50`)}`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('wait');
            await include('httpEvents');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await transaction('First', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.wait(async () => {
                    await wait.documentComplete();
                });
            });

        }, {url: navigateUrl});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [transaction] = result.result.transactions;
        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 5);
        eq(events[0].metaData.url, navigateUrl);
        eq(events[1].metaData.url, `http://${host}/static/static.html?waitBeforeResponse=50`);
        eq(events[2].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[3].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[4].metaData.url, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
        eq(events[0].metaData.finalUrl, navigateUrl);
        eq(events[1].metaData.finalUrl, `http://${host}/static/static.html?waitBeforeResponse=50`);
        eq(events[2].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=50&bytesPerSecond=400000`);
        eq(events[3].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=35&bytesPerSecond=300000`);
        eq(events[4].metaData.finalUrl, `http://${host}/static/foo.jpg?noCache&waitBeforeResponse=60&bytesPerSecond=400000`);
    });

    specify('Tracking of failed requests', async () => {
        const host = `localhost:${testServerPort()}`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const {delay} = await include('wait');
            await include('httpEvents');
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            await transaction('First', async () => {
                await assert.isRejected(
                    tab.navigate(injected.url, {timeout: '2s'})
                );
            });
            await delay('1s');

        }, {url: `http://${host}/unexpected-close`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [transaction] = result.result.transactions;
        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 1);

        const event = events[0];
        isAtLeast(event.timing.begin.time, transaction.timing.begin.time);
        isAtMost(event.timing.end.time, transaction.timing.end.time);

        eq(event.metaData.url, `http://${host}/unexpected-close`);
        isString(event.metaData.error);
        isAtLeast(event.metaData.error.length, 5);
    });

    specify('Tracking of script-env fetch() requests', async () => {
        const host = `localhost:${testServerPort()}`;
        const urlPrefix = `http://${host}/static`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const expect = await include('expect');
            const {delay} = await include('wait');
            await include('httpEvents');

            // (without creating a tab or even loading the tabs module)

            await transaction('First', async () => {
                const response = await fetch(injected.url);
                const body = await response.text();
                expect(body).to.contain('Lorem ipsum');
            });
            await delay('1s');

        }, {url: `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const [transaction] = result.result.transactions;
        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 1);

        {
            const [event] = events;
            eq(event.metaData.url, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
            eq(event.metaData.finalUrl, `${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
            eq(event.metaData.method, 'GET');
            eq(event.metaData.type, 'xmlhttprequest');
            eq(event.metaData.originUrl, null);
            eq(event.longTitle, `GET ${urlPrefix}/static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
            eq(event.shortTitle, `GET static.html?waitBeforeResponse=50&bytesPerSecond=100000`);
            approximately(event.timing.duration, 50 + STATIC_HTML_SIZE / 100000 * 1000, 250);
            deq(event.metaData.responseHeaders.filter(h => h.name === 'Content-Type'), [{
                name: 'Content-Type',
                value: 'text/html',
            }]);

            isAtLeast(event.timing.begin.time, transaction.timing.begin.time);
            isAtMost(event.timing.end.time, transaction.timing.end.time);
            Array.isArray(event.metaData.requestHeaders);
            deq(event.metaData.requestHeaders.filter(h => h.name === 'Host'), [{
                name: 'Host',
                value: host,
            }]);
            eq(event.metaData.ip, '127.0.0.1');
            eq(event.metaData.statusCode, 200);
            eq(event.metaData.fromCache, false);
            eq(event.metaData.redirectUrl, null);
            eq(event.metaData.statusLine, 'HTTP/1.1 200 OK');

            lengthOf(event.children, 2);
            const sendRequestEvent = event.children[0];
            eq(sendRequestEvent.type, 'http:sendRequest');
            isAtLeast(sendRequestEvent.timing.begin.time, event.timing.begin.time);
            isAtMost(sendRequestEvent.timing.begin.time, event.timing.end.time);
            isAtLeast(sendRequestEvent.timing.end.time, sendRequestEvent.timing.begin.time);
            isAtMost(sendRequestEvent.timing.end.time, event.timing.end.time);

            const receiveResponseEvent = event.children[1];
            eq(receiveResponseEvent.type, 'http:receiveResponse');
            isAtLeast(receiveResponseEvent.timing.begin.time, event.timing.begin.time);
            isAtMost(receiveResponseEvent.timing.begin.time, event.timing.end.time);
            isAtLeast(receiveResponseEvent.timing.end.time, receiveResponseEvent.timing.begin.time);
            isAtMost(receiveResponseEvent.timing.end.time, event.timing.end.time);
            isAtLeast(receiveResponseEvent.timing.begin.time, sendRequestEvent.timing.end.time);
        }
    });

    specify('Tracking of requests triggered by Web Workers', async () => {
        const host = `localhost:${testServerPort()}`;
        const urlPrefix = `http://${host}/static`;

        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const {delay} = await include('wait');
            await include('httpEvents');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await transaction('First', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                await tab.run(async () => {
                    await wait.documentComplete();
                });
            });
            await delay('1s');

        }, {url: `${urlPrefix}/fetchWorker.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const events = result.result.events.filter(httpEventNoFaviconFilter);
        lengthOf(events, 3);
        eq(events[0].metaData.url, `${urlPrefix}/fetchWorker.html`);
        eq(events[1].metaData.url, `${urlPrefix}/js/fetchWorker.js`);
        eq(events[2].metaData.url, `${urlPrefix}/static.html?fromWorker`);
    });
});
