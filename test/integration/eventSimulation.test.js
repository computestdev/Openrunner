'use strict';
const {describe, specify} = require('mocha-sugar-free');
require('chai').use(require('chai-subset'));
const {assert: {lengthOf, containSubset, strictEqual: eq, isAtLeast}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe('integration/eventSimulation', {slow: 10000, timeout: 60000}, () => {
    specify('Simulating clicks', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            await include('eventSimulation');
            await include('wait');
            await include('assert');

            const tab = await tabs.create();
            await tab.navigate(injected.url, {timeout: '10s'});

            return await tab.run(async () => {
                await wait.documentComplete();
                const target = document.querySelector('#target');
                const result = document.querySelector('#result');

                document.scrollingElement.scrollTop = 100; // make sure scrolling it taken into account
                await eventSimulation.click(target, {mouseDownDuration: 250});

                return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
            });
        }, {url: `http://localhost:${testServerPort()}/static/mouseClickEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const events = result.value;
        eq(events[0].type, 'mousedown');
        eq(events[1].type, 'mouseup');
        eq(events[2].type, 'click');
        lengthOf(events, 3);

        for (const event of events) {
            containSubset(event, {
                target: '#target',
                bubbles: true,
                cancelable: true,
                composed: true,
                screenX: 142 + 200 / 2,
                screenY: 142 + 20 / 2 + 72 - 100,
                clientX: 142 + 200 / 2,
                clientY: 142 + 20 / 2 - 100,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
                button: 0,
                buttons: 1,
                relatedTarget: null,
            });
        }

        isAtLeast(events[1].timeStamp - events[0].timeStamp, 250);
    });
});
