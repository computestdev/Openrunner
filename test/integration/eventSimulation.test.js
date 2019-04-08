'use strict';
const {describe, specify} = require('mocha-sugar-free');
require('chai').use(require('chai-subset'));
const {assert: {lengthOf, containSubset, strictEqual: eq, isAtLeast, approximately}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('./setupIntegrationTest');
const keyInputTestCases = require('./testCases/keyInput.json');
const cancelledKeyInputTestCases = require('./testCases/cancelledKeyInput.json');

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
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
                button: 0,
                buttons: 1,
                relatedTarget: null,
            });
            approximately(event.screenX, 142 + 200 / 2, 1, 'event.screenX');
            approximately(event.screenY, 142 + 20 / 2 + 72 - 100, 1, 'event.screenY');
            approximately(event.clientX, 142 + 200 / 2, 1, 'event.clientX');
            approximately(event.clientY, 142 + 20 / 2 - 100, 1, 'event.clientY');
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
                composed: true,
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
                composed: true,
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
                composed: true,
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

    describe('Keyboard', () => {
        describe('Simulating keyboard events without effecting any changes', () => {
            for (const {testCaseName, keyIdentifiers, expectedEvents} of keyInputTestCases) {
                // eslint-disable-next-line no-loop-func
                specify(testCaseName, async () => {
                    /* eslint-disable no-undef */
                    const result = await runScriptFromFunction(async () => {
                        'Openrunner-Script: v1';
                        const tabs = await include('tabs');
                        await include('eventSimulation');
                        await include('wait');
                        await include('assert');

                        const tab = await tabs.create();
                        await tab.navigate(injected.url, {timeout: '10s'});

                        return await tab.run(async keyIdentifiers => {
                            await wait.documentComplete();
                            const textarea = document.querySelector('#textarea');
                            const result = document.querySelector('#result');

                            await eventSimulation.keyboardKeys(textarea, keyIdentifiers);

                            return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                        }, injected.keyIdentifiers);
                    }, {url: `http://localhost:${testServerPort()}/static/keyboardEvents.html`, keyIdentifiers});
                    /* eslint-enable no-undef */

                    if (result.error) {
                        throw result.error;
                    }

                    const events = result.value;
                    const expectedKeyboardEvents = expectedEvents.filter(
                        e => e.type === 'keydown' || e.type === 'keyup' || e.type === 'keypress'
                    );

                    for (let i = 0; i < expectedKeyboardEvents.length; ++i) {
                        const expectedEvent = Object.assign({}, expectedKeyboardEvents[i]);
                        delete expectedEvent.targetValue;
                        const event = events[i];
                        containSubset(event, expectedEvent, `Event ${i}`);
                    }

                    lengthOf(events, expectedKeyboardEvents.length);
                });
            }
        });

        describe('Simulating keyboard events and input to text controls', () => {
            for (const {testCaseName, keyIdentifiers, expectedEvents} of keyInputTestCases) {
                // eslint-disable-next-line no-loop-func
                specify(testCaseName, async () => {
                    /* eslint-disable no-undef */
                    const result = await runScriptFromFunction(async () => {
                        'Openrunner-Script: v1';
                        const tabs = await include('tabs');
                        await include('eventSimulation');
                        await include('wait');
                        await include('assert');

                        const tab = await tabs.create();
                        await tab.navigate(injected.url, {timeout: '10s'});

                        return await tab.run(async keyIdentifiers => {
                            await wait.documentComplete();
                            const textarea = document.querySelector('#textarea');
                            const result = document.querySelector('#result');

                            textarea.value = '';
                            await eventSimulation.keyboardTextInput(textarea, keyIdentifiers);

                            return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                        }, injected.keyIdentifiers);
                    }, {url: `http://localhost:${testServerPort()}/static/keyboardEvents.html`, keyIdentifiers});
                    /* eslint-enable no-undef */

                    if (result.error) {
                        throw result.error;
                    }

                    const events = result.value;

                    for (let i = 0; i < expectedEvents.length; ++i) {
                        const event = events[i];

                        const expectedEvent = Object.assign({}, expectedEvents[i]);
                        if (event.data === undefined) {
                            // InputEvent#data is not yet implemented by firefox (57) https://bugzilla.mozilla.org/show_bug.cgi?id=998941
                            // TODO: remove this line when the feature lands in firefox:
                            delete expectedEvent.data;
                        }

                        containSubset(event, expectedEvent, `Event ${i}`);
                    }

                    lengthOf(events, expectedEvents.length);
                });
            }

            specify('Handling of cancelled events', async () => {
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
                        const textarea = document.querySelector('#textarea');
                        const result = document.querySelector('#result');

                        textarea.value = '';
                        document.querySelector('#keydownCancel').checked = true;
                        await eventSimulation.keyboardTextInput(textarea, ['a', 'b', 'c']);
                        document.querySelector('#keydownCancel').checked = false;

                        document.querySelector('#keypressCancel').checked = true;
                        await eventSimulation.keyboardTextInput(textarea, ['d', 'e', 'f']);
                        document.querySelector('#keypressCancel').checked = false;

                        document.querySelector('#beforeinputCancel').checked = true;
                        await eventSimulation.keyboardTextInput(textarea, ['g', 'h', 'j']);
                        document.querySelector('#beforeinputCancel').checked = false;

                        document.querySelector('#inputCancel').checked = true;
                        await eventSimulation.keyboardTextInput(textarea, ['k', 'l', 'm']);
                        document.querySelector('#inputCancel').checked = false;

                        document.querySelector('#keyupCancel').checked = true;
                        await eventSimulation.keyboardTextInput(textarea, ['n', 'o', 'p']);
                        document.querySelector('#keyupCancel').checked = false;

                        return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                    });
                }, {url: `http://localhost:${testServerPort()}/static/keyboardEvents.html`});
                /* eslint-enable no-undef */

                if (result.error) {
                    throw result.error;
                }

                const events = result.value;
                const {expectedEvents} = cancelledKeyInputTestCases;

                for (let i = 0; i < expectedEvents.length; ++i) {
                    const event = events[i];

                    const expectedEvent = Object.assign({}, expectedEvents[i]);
                    if (event.data === undefined) {
                        // InputEvent#data is not yet implemented by firefox (57) https://bugzilla.mozilla.org/show_bug.cgi?id=998941
                        // TODO: remove this line when the feature lands in firefox:
                        delete expectedEvent.data;
                    }

                    containSubset(event, expectedEvent, `Event ${i}`);
                }

                lengthOf(events, expectedEvents.length);
            });

            specify('Focusing if the element is not active', async () => {
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

                        target1.focus();
                        result.value = '';
                        await eventSimulation.keyboardTextInput(target1, [...' abc']); // should not trigger focus events
                        await eventSimulation.keyboardTextInput(target2, [...' def']); // should trigger focus events

                        return {
                            events: JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`),
                            target1Value: target1.value,
                            target2Value: target2.value,
                        };
                    });
                }, {url: `http://localhost:${testServerPort()}/static/focusEvents.html`});
                /* eslint-enable no-undef */

                if (result.error) {
                    throw result.error;
                }

                const {events, target1Value, target2Value} = result.value;
                eq(target1Value, 'foo abc');
                eq(target2Value, 'bar def');

                containSubset(events[0], {
                    type: 'blur',
                    target: '#target1',
                    bubbles: false,
                    cancelable: false,
                    composed: true,
                    relatedTarget: '#target2',
                    activeElement: '<body>',
                });
                containSubset(events[1], {
                    type: 'focusout',
                    target: '#target1',
                    bubbles: true,
                    cancelable: false,
                    composed: true,
                    relatedTarget: '#target2',
                    activeElement: '<body>',
                });
                containSubset(events[2], {
                    type: 'focus',
                    target: '#target2',
                    bubbles: false,
                    cancelable: false,
                    composed: true,
                    relatedTarget: '#target1',
                    activeElement: '#target2',
                });
                containSubset(events[3], {
                    type: 'focusin',
                    target: '#target2',
                    bubbles: true,
                    cancelable: false,
                    composed: true,
                    relatedTarget: '#target1',
                    activeElement: '#target2',
                });
                lengthOf(events, 4);
            });

            specify('contentEditable', async () => {
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
                        const contentEditable = document.querySelector('#contentEditable');
                        const result = document.querySelector('#result');

                        contentEditable.innerHTML = 'foo';
                        await eventSimulation.keyboardTextInput(contentEditable, [...'bar']);

                        return JSON.parse(`[ ${result.value.replace(/,\s*$/, '')} ]`);
                    }, injected.keyIdentifiers);
                }, {url: `http://localhost:${testServerPort()}/static/keyboardEvents.html`});
                /* eslint-enable no-undef */

                if (result.error) {
                    throw result.error;
                }

                const events = result.value;

                containSubset(events[0], {type: 'keydown', code: 'KeyB', target: '#contentEditable'});
                containSubset(events[1], {type: 'keypress', code: 'KeyB', target: '#contentEditable'});
                containSubset(events[2], {type: 'beforeinput', target: '#contentEditable'});
                containSubset(events[3], {type: 'input', target: '#contentEditable'});
                containSubset(events[4], {type: 'keyup', code: 'KeyB', target: '#contentEditable'});

                containSubset(events[5], {type: 'keydown', code: 'KeyA', target: '#contentEditable'});
                containSubset(events[6], {type: 'keypress', code: 'KeyA', target: '#contentEditable'});
                containSubset(events[7], {type: 'beforeinput', target: '#contentEditable'});
                containSubset(events[8], {type: 'input', target: '#contentEditable'});
                containSubset(events[9], {type: 'keyup', code: 'KeyA', target: '#contentEditable'});

                containSubset(events[10], {type: 'keydown', code: 'KeyR', target: '#contentEditable'});
                containSubset(events[11], {type: 'keypress', code: 'KeyR', target: '#contentEditable'});
                containSubset(events[12], {type: 'beforeinput', target: '#contentEditable'});
                containSubset(events[13], {type: 'input', target: '#contentEditable'});
                containSubset(events[14], {type: 'keyup', code: 'KeyR', target: '#contentEditable'});

                lengthOf(events, 15); // no change event for contentEditable!
            });
        });

        specify('Keyboard simulation argument validation', async () => {
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
                    const textarea = document.createElement('textarea');

                    await assert.isRejected(
                        eventSimulation.keyboardKeys(document.createTextNode('foo'), ['x']),
                        /keyboardKeys.*expected.*element/i
                    );
                    await assert.isRejected(
                        eventSimulation.keyboardKeys(textarea, ['foo']),
                        /key.*not.*supported.*foo/i
                    );
                    await assert.isRejected(
                        eventSimulation.keyboardTextInput(document.createElement('div'), ['x']),
                        /keyboardTextInput.*DIV.*not.*element.*text.*input/i
                    );
                    const inputHidden = document.createElement('input');
                    inputHidden.type = 'hidden';
                    await assert.isRejected(
                        eventSimulation.keyboardTextInput(inputHidden, ['x']),
                        /keyboardTextInput.*INPUT hidden.*not.*element.*text.*input/i
                    );
                });
            }, {url: `http://localhost:${testServerPort()}/static/empty.html`});
            /* eslint-enable no-undef */

            if (result.error) {
                throw result.error;
            }
        });
    });
});
