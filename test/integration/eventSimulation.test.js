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

    describe('Focus', () => {
        const assertFocusEvents = events => {
            containSubset(events[0], {
                type: 'focus',
                target: '#target1',
                activeElement: '#target1',
                relatedTarget: null,
                bubbles: false,
                cancelable: false,
                composed: true,
            });

            containSubset(events[1], {
                type: 'focusin',
                target: '#target1',
                activeElement: '#target1',
                relatedTarget: null,
                bubbles: true,
                cancelable: false,
                composed: false,
            });

            containSubset(events[2], {
                type: 'blur',
                target: '#target1',
                activeElement: '<body>',
                relatedTarget: '#target2',
                bubbles: false,
                cancelable: false,
                composed: true,
            });

            containSubset(events[3], {
                type: 'focusout',
                target: '#target1',
                activeElement: '<body>',
                relatedTarget: '#target2',
                bubbles: true,
                cancelable: false,
                composed: false,
            });

            containSubset(events[4], {
                type: 'focus',
                target: '#target2',
                activeElement: '#target2',
                relatedTarget: '#target1',
                bubbles: false,
                cancelable: false,
                composed: true,
            });

            containSubset(events[5], {
                type: 'focusin',
                target: '#target2',
                activeElement: '#target2',
                relatedTarget: '#target1',
                bubbles: true,
                cancelable: false,
                composed: false,
            });

            lengthOf(events, 6);
        };

        specify('Simulating focus while the document is in focus', async () => {
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
                    const target1 = document.querySelector('#target1');
                    const target2 = document.querySelector('#target2');
                    const result = document.querySelector('#result');

                    eventSimulation.focus(target1);
                    await wait.delay(25);
                    eventSimulation.focus(target2);

                    return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                });
            }, {url: `http://localhost:${testServerPort()}/static/focusEvents.html`});
            /* eslint-enable no-undef */

            if (result.error) {
                throw result.error;
            }

            assertFocusEvents(result.value);
        });

        specify('Simulating focus while document is out of focus', async () => {
            /* eslint-disable no-undef */
            const result = await runScriptFromFunction(async () => {
                'Openrunner-Script: v1';
                const tabs = await include('tabs');
                await include('eventSimulation');
                await include('wait');
                await include('assert');

                const tab = await tabs.create();
                await tabs.create(); // create another tab so that the first one is not in focus
                await tab.navigate(injected.url, {timeout: '10s'});

                return await tab.run(async () => {
                    await wait.documentComplete();
                    const target1 = document.querySelector('#target1');
                    const target2 = document.querySelector('#target2');
                    const result = document.querySelector('#result');

                    assert(!document.hasFocus(), 'document should not be in focus during this test');

                    eventSimulation.focus(target1);
                    await wait.delay(25);
                    eventSimulation.focus(target2);

                    return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                });
            }, {url: `http://localhost:${testServerPort()}/static/focusEvents.html`});
            /* eslint-enable no-undef */

            if (result.error) {
                throw result.error;
            }

            assertFocusEvents(result.value);
        });
    });
});
