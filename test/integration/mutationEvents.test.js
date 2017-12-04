'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, lengthOf}} = require('chai');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

const findMutationEventAfterInteractive = result => {
    const {events} = result.result;
    const interactiveEvent = events.find(e => e.type === 'content:documentInteractive');
    const interactiveTime = interactiveEvent.timing.begin.time;
    return events.filter(event => event.type === 'content:domMutation' && event.timing.begin.time > interactiveTime);
};

describe('integration/mutationEvents', {timeout: 60000, slow: 20000}, () => {
    specify('Adding elements and other nodes', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const div = document.createElement('div');
                div.id = 'someDiv';
                document.body.appendChild(div);

                const p = document.createElement('p');
                div.appendChild(p);
                p.className = 'paragraph';
                div.appendChild(document.createTextNode('foo'));
                div.appendChild(document.createElement('hr'));
                div.appendChild(document.createElement('strong'));
                div.appendChild(document.createTextNode('bar'));
                const section = document.createElement('section');
                section.className = 'someSection anotherClass';
                document.body.appendChild(section);

                section.innerHTML = '<a>foo</a><b>bar</b>';
            });

        }, {url: `http://localhost:${testServerPort()}/static/empty.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.timing.duration, 0);
        eq(event.metaData.addedElementRawCount, 7);
        eq(event.metaData.removedElementRawCount, 0);
        eq(event.metaData.removedElements.length, 0);
        eq(event.metaData.addedElements.length, 2);
        eq(event.metaData.addedElements[0], 'html > body > div#someDiv:nth-child(1)');
        eq(event.metaData.addedElements[1], 'html > body > section.anotherClass.someSection:nth-child(2)');
    });

    specify('Removing and re-adding an element to the same parent', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const div = document.querySelector('#someDiv');
                const p = document.querySelector('#someDiv p');
                div.removeChild(p);
                div.appendChild(p);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // should add document-mutation event, but only with addedElements, we are only interested in the final state that an element is in,
        // during a mutation event
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 1);
        eq(event.metaData.removedElementRawCount, 1);
        eq(event.metaData.removedElements.length, 0);
        eq(event.metaData.addedElements.length, 1);
        eq(event.metaData.addedElements[0], 'html > body > div#someDiv:nth-child(1) > p.paragraph:nth-child(3)');
    });

    specify('Append an element to a parent and immediately to a different parent', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const h3 = document.createElement('h3');
                const div = document.querySelector('#someDiv');
                const section = document.querySelector('section');
                div.appendChild(h3);
                section.appendChild(h3);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // single addedElements (only the newest parent)
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 2);
        eq(event.metaData.removedElementRawCount, 1);
        eq(event.metaData.removedElements.length, 0);
        eq(event.metaData.addedElements.length, 1);
        eq(
            event.metaData.addedElements[0],
            'html > body > section.anotherClass.someSection:nth-child(2) > h3:nth-child(3)'
        );
    });

    specify('Append an element and immediately remove it again', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const article = document.createElement('article');
                document.body.appendChild(article);
                document.body.removeChild(article);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // single addedElements (only the newest parent)
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 1);
        eq(event.metaData.removedElementRawCount, 1);
        eq(event.metaData.removedElements.length, 1);
        eq(event.metaData.removedElements[0], 'html > body > article');
        eq(event.metaData.addedElements.length, 0);
    });

    specify('Remove an element', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const div = document.querySelector('#someDiv');
                const p = document.querySelector('#someDiv p');
                div.removeChild(p);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // single addedElements (only the newest parent)
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 0);
        eq(event.metaData.removedElementRawCount, 1);
        eq(event.metaData.removedElements.length, 1);
        eq(event.metaData.removedElements[0], 'html > body > div#someDiv:nth-child(1) > p.paragraph');
        eq(event.metaData.addedElements.length, 0);
    });

    specify('Remove an element, then immediately remove the parent', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const div = document.querySelector('#someDiv');
                while (div.firstChild) {
                    div.removeChild(div.firstChild);
                }
                document.body.removeChild(div);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // single addedElements (only the newest parent)
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 0);
        eq(event.metaData.removedElementRawCount, 4);
        eq(event.metaData.removedElements.length, 1);
        eq(event.metaData.removedElements[0], 'html > body > div#someDiv');
        eq(event.metaData.addedElements.length, 0);
    });

    specify('Append an element, then immediately remove the parent', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('mutationEvents');
            await include('contentEvents');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();

                const section = document.querySelector('section');
                const h1 = document.createElement('h1');
                section.appendChild(h1);
                document.body.removeChild(section);
            });

        }, {url: `http://localhost:${testServerPort()}/static/mutationEvents.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }

        const mutationEvents = findMutationEventAfterInteractive(result);
        lengthOf(mutationEvents, 1);

        // single addedElements (only the newest parent)
        const event = mutationEvents[0];
        eq(event.type, 'content:domMutation');
        eq(event.metaData.addedElementRawCount, 1);
        eq(event.metaData.removedElementRawCount, 1);
        eq(event.metaData.removedElements.length, 1);
        eq(event.metaData.removedElements[0], 'html > body > section.anotherClass.someSection');
        eq(event.metaData.addedElements.length, 0);
    });
});
