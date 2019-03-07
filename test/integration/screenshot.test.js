'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, lengthOf, isAbove, isObject, isString, match}} = require('chai');

const {runScriptFromFunction, testServerPort, testServerBadTLSPort} = require('../utilities/integrationTest');

const assertJpegDataUrl = url => {
    isString(url);
    const dataUrlRegexp = /^data:image\/jpeg;base64,([a-zA-Z0-9\/+]{1000,}=*)$/;
    match(url, dataUrlRegexp);
    const [, imageBase64] = dataUrlRegexp.exec(url);
    const imageData = Buffer.from(imageBase64, 'base64');
    const jpegSoi = imageData.readUInt16BE(0);
    const jpegMarker = imageData.readUInt16BE(2);
    eq(jpegSoi, 0xffd8);
    eq(jpegMarker & 0xffe0, 0xffe0);
};

describe('integration/screenshot', {timeout: 60000, slow: 20000}, () => {
    specify('Taking a screenshot manually', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const screenshot = await include('screenshot');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentComplete();
            });
            await screenshot.take('foo bar');

        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const screenshotEvents = result.result.events.filter(({type}) => type === 'screenshot');
        lengthOf(screenshotEvents, 1);

        const event = screenshotEvents[0];
        eq(event.type, 'screenshot');
        eq(event.shortTitle, 'Screenshot');
        eq(event.longTitle, 'Screenshot');
        eq(event.comment, 'foo bar');
        isAbove(event.timing.duration, 0, 'the duration should represent the overhead of taking a screenshot');

        isObject(event.metaData.data);
        eq(event.metaData.data.dataURL, true);
        assertJpegDataUrl(event.metaData.data.data);
    });

    specify('Taking a screenshot when the script rejects', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('screenshot');
            throw Error('Error from test!');
        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        eq(result.error.message, 'Error from test!');

        const screenshotEvents = result.result.events.filter(({type}) => type === 'screenshot');
        lengthOf(screenshotEvents, 1);

        const event = screenshotEvents[0];
        eq(event.type, 'screenshot');
        eq(event.shortTitle, 'Screenshot (script error)');
        eq(event.longTitle, 'Screenshot (script error): Error from test!');
        eq(event.metaData.causedByScriptError, true);

        isObject(event.metaData.data);
        eq(event.metaData.data.dataURL, true);
        assertJpegDataUrl(event.metaData.data.data);
    });

    specify('Taking a screenshot of a page with a TLS error', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const screenshot = await include('screenshot');
            const tab = await tabs.create();

            await assert.isRejected(
                tab.navigate(injected.badURL, {timeout: '10s'}),
                Error,
                /navigating.*https:\/\/localhost.*time.*out/i
            );

            assert.isRejected(screenshot.take(), Error, /screenshot.*take.*unable/i);

            // should be able to navigate again
            await tab.navigate(injected.goodURL + '?foo', {timeout: '10s'});
            assert.strictEqual(await tab.run(() => location.search), '?foo');
        }, {
            badURL: `https://localhost:${testServerBadTLSPort()}/`,
            goodURL: `http://localhost:${testServerPort()}/static/static.html`,
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Taking a screenshot of a page with a TLS error when the script rejects', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('screenshot');
            const tab = await tabs.create();

            await assert.isRejected(
                tab.navigate(injected.badURL, {timeout: '2s'}),
                Error,
                /navigating.*https:\/\/localhost.*time.*out/i
            );

            throw Error('Error from test!');
        }, {
            badURL: `https://localhost:${testServerBadTLSPort()}/`,
        });
        /* eslint-enable no-undef */

        eq(result.error.message, 'Error from test!');
    });
});
