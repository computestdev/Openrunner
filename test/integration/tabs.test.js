'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {lengthOf, strictEqual: eq}} = require('chai');

const {runScriptFromFunction, runScript, testServerPort, testServerBadTLSPort} = require('../utilities/integrationTest');

describe('integration/tabs', {timeout: 60000, slow: 10000}, () => {
    specify('Successful navigation', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();
            await tab.navigate(injected.url, {timeout: '2s'});
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Navigation to invalid url', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            {
                const err = await assert.isRejected(
                    tab.navigate('foo://bar', {timeout: '2s'}),
                    /url.*must.*absolute.*HTTP.*URL/
                );
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }

            {
                const err = await assert.isRejected(
                    tab.navigate('foo.html', {timeout: '2s'}),
                    /url.*must.*absolute.*HTTP.*URL/i
                );
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Navigating to an url which never sends a reply', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const tab = await tabs.create();
            const assert = await include('assert');

            const before = Date.now();
            const err = await assert.isRejected(
                tab.navigate(injected.url, {timeout: '2s'}),
                /Navigating.*http:\/\/localhost.*no-reply.*time.*out.*2 second/i
            );
            const after = Date.now();
            assert.strictEqual(err.name, 'Openrunner:NavigateError');
            assert.approximately(after - before, 2000, 500);
        }, {url: `http://localhost:${testServerPort()}/no-reply`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script once', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();
            await tab.navigate(injected.url, {timeout: '2s'});

            {
                // returning a value and passing an argument
                // using a multi line arrow function
                const result = await tab.run(({foo}) => {
                    return {result: foo + 5};
                }, {foo: 1000});
                assert.deepEqual(result, {result: 1005});
            }

            {
                // using a single line arrow function
                const result = await tab.run(() => 123);
                assert.strictEqual(result, 123);
            }

            {
                // using a regular function
                // eslint-disable-next-line prefer-arrow-callback
                const result = await tab.run(function (foo) {
                    return foo + ' bar';
                }, 'foo');
                assert.strictEqual(result, 'foo bar');
            }

            {
                // throwing
                await assert.isRejected(
                    tab.run(() => {
                        throw Error('foo');
                    }),
                    Error,
                    'foo'
                );
            }

            {
                // wait for a promise to resolve
                const result = await tab.run(() => {
                    return new Promise(resolve => setTimeout(() => resolve('foo'), 10));
                }, '');
                assert.strictEqual(result, 'foo');
            }

            {
                // wait for a promise to reject
                await assert.isRejected(
                    tab.run(() => {
                        return new Promise((resolve, reject) => setTimeout(() => reject(Error('foo')), 10));
                    }),
                    Error,
                    'foo'
                );
            }

            {
                // wait for an async multi line arrow function to complete
                const result = await tab.run(async () => {
                    return 'foo';
                });
                assert.strictEqual(result, 'foo');
            }

            {
                // wait for an async single line arrow function to complete
                const result = await tab.run(async () => 'bar');
                assert.strictEqual(result, 'bar');
            }

            {
                // wait for an async regular function to complete
                // eslint-disable-next-line prefer-arrow-callback
                const result = await tab.run(function () {
                    return 'baz';
                });
                assert.strictEqual(result, 'baz');
            }

            {
                // accessing openrunner content script globals
                const begin = Date.now();
                const result = await tab.run(() => {
                    return [
                        typeof transaction,
                        typeof runMetadata,
                        typeof runMetadata === 'object' && typeof runMetadata.runBeginTime,
                        typeof runMetadata === 'object' && runMetadata.runBeginTime,
                    ];
                });
                assert.strictEqual(result[0], 'function');
                assert.strictEqual(result[1], 'object');
                assert.strictEqual(result[2], 'number');
                assert.approximately(result[3], begin, 50);
            }

            {
                // accessing the DOM
                const result = await tab.run(() => {
                    return [
                        typeof window,
                        typeof window.CharacterData,
                        typeof document,
                        document === window.document,
                    ];
                });
                assert.deepEqual(result, [
                    'object',
                    'function',
                    'object',
                    true,
                ]);
            }
        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script once, while the page navigates away', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '2s'});
            const runPromise = tab.run(() => {
                return new Promise(() => {}); // always pending
            });
            let runPromiseRejectionTime;
            runPromise.catch(() => { runPromiseRejectionTime = Date.now(); });

            const secondNavigationTime = Date.now();
            await tab.navigate(injected.url + '?foo', {timeout: '2s'});
            const err = await assert.isRejected(runPromise, Error, /page.*navigated.*away.*while.*execution.*content script.*pending/i);
            assert.strictEqual(err.name, 'Openrunner:ContentScriptAbortedError');
            assert.approximately(runPromiseRejectionTime - secondNavigationTime, 0, 100);

        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script and repeating it if the page navigates away', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

            await tab.navigate(injected.url + '?initial', {timeout: '2s'});

            let waitPromiseResolved = false;
            const waitPromise = tab.wait(async () => {
                sessionStorage.progress = (sessionStorage.progress || '') + ',' + location.search;
                if (/^\?resolve/.test(location.search)) {
                    return location.search;
                }
                return new Promise(() => {}); // pending
            });
            waitPromise.then(() => {
                waitPromiseResolved = true;
            });

            const getProgress = async () => tab.run(() => sessionStorage.progress);

            await tab.navigate(injected.url + '?pending1', {timeout: '2s'});
            await delay(50);
            assert.deepEqual(await getProgress(), ',?initial,?pending1');
            assert.isFalse(waitPromiseResolved);

            await tab.navigate(injected.url + '?pending2', {timeout: '2s'});
            await delay(50);
            assert.deepEqual(await getProgress(), ',?initial,?pending1,?pending2');
            assert.isFalse(waitPromiseResolved);

            await tab.navigate(injected.url + '?resolve1', {timeout: '2s'});
            await delay(50);
            assert.deepEqual(await getProgress(), ',?initial,?pending1,?pending2,?resolve1');
            assert.isTrue(waitPromiseResolved);
            assert.strictEqual(await waitPromise, '?resolve1');

            await tab.navigate(injected.url + '?previouslyResolved', {timeout: '2s'});
            await delay(50);
            assert.strictEqual(await getProgress(), ',?initial,?pending1,?pending2,?resolve1'); // should not call the wait script again
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script and repeating it if the page navigates away unless a rejection occurs', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

            await tab.navigate(injected.url + '?initial', {timeout: '2s'});

            let waitPromiseRejected = false;
            const waitPromise = tab.wait(async () => {
                sessionStorage.progress = (sessionStorage.progress || '') + ',' + location.search;
                if (/^\?reject/.test(location.search)) {
                    throw Error('Error from test!');
                }
                return new Promise(() => {}); // pending
            });
            waitPromise.catch(() => {
                waitPromiseRejected = true;
            });

            const getProgress = async () => tab.run(() => sessionStorage.progress);

            await tab.navigate(injected.url + '?pending', {timeout: '2s'});
            await delay(50);
            assert.deepEqual(await getProgress(), ',?initial,?pending');
            assert.isFalse(waitPromiseRejected);

            await tab.navigate(injected.url + '?reject', {timeout: '2s'});
            await delay(50);
            assert.deepEqual(await getProgress(), ',?initial,?pending,?reject');
            assert.isTrue(waitPromiseRejected);
            await assert.isRejected(waitPromise, Error, 'Error from test!');

            await tab.navigate(injected.url + '?previouslyRejected', {timeout: '2s'});
            await delay(50);
            assert.strictEqual(await getProgress(), ',?initial,?pending,?reject'); // should not call the wait script again
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script and waiting until it triggers a navigation', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

            {
                await tab.navigate(injected.url + '?initial', {timeout: '2s'});

                let waitPromiseResolved = false;
                const waitPromise = tab.waitForNewPage(async () => {
                    return 123; // the return value should be ignored
                });
                waitPromise.then(() => {
                    waitPromiseResolved = true;
                });

                await delay(50);
                assert.isFalse(waitPromiseResolved);

                await tab.navigate(injected.url + '?pending1', {timeout: '2s'});
                await delay(50);
                assert.isTrue(waitPromiseResolved);
                assert.strictEqual(await waitPromise, undefined);
            }

            {
                // if the content script is still pending, waitForNewPage should still resolve after the navigation occurs
                await tab.navigate(injected.url + '?initial', {timeout: '2s'});

                let waitPromiseResolved = false;
                const waitPromise = tab.waitForNewPage(async () => {
                    return new Promise(() => {}); // pending
                });
                waitPromise.then(() => {
                    waitPromiseResolved = true;
                });

                await delay(50);
                assert.isFalse(waitPromiseResolved);

                await tab.navigate(injected.url + '?pending1', {timeout: '2s'});
                await delay(50);
                assert.isTrue(waitPromiseResolved);
                assert.strictEqual(await waitPromise, undefined);
            }


        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script and waiting until it triggers a navigation unless it rejects', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            await tab.navigate(injected.url + '?initial', {timeout: '2s'});

            const waitPromise = tab.waitForNewPage(async () => {
                throw Error('Error from test!!');
            });

            await assert.isRejected(waitPromise, Error, 'Error from test!!');

        }, {url: `http://localhost:${testServerPort()}/headers/html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Navigating to an URL with a TLS error', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();

            const err = await assert.isRejected(
                tab.navigate(injected.badURL, {timeout: '2s'}),
                Error,
                /navigating.*https:\/\/localhost.*time.*out/i
            );
            assert.strictEqual(err.name, 'Openrunner:NavigateError');

            // should be able to navigate again
            await tab.navigate(injected.goodURL + '?foo', {timeout: '2s'});
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

    describe('Proper short stack traces', () => {
        const SCRIPT_INIT =
            `'Openrunner-Script: v1';` +
            `const tabs = await include('tabs');` +
            `const tab = await tabs.create();`;

        specify('tab.navigate() with an invalid argument', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `  // line 2\n` +
                `    await tab.navigate('foo://bar', {timeout: '2s'}); // line 3; Error here\n` +
                `// line 4`
            );
            eq(result.error.name, 'Openrunner:IllegalArgumentError');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);
            lengthOf(scriptStackFrames, 1);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 3);
            eq(scriptStackFrames[0].columnNumber, 11); // Position of "tab.navigate"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');
        });

        specify('tab.navigate() to an invalid page', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `await tab.navigate('http://localhost:${testServerPort()}/no-reply', {timeout: '0.1s'}); // line 2; Error here`
            );

            eq(result.error.name, 'Openrunner:NavigateError');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);
            lengthOf(scriptStackFrames, 1);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 2);
            eq(scriptStackFrames[0].columnNumber, 7); // Position of "tab.navigate"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');
        });

        specify('tab.run() rejected by a runner content script', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `await tab.navigate('http://localhost:${testServerPort()}/static/textOnly.html'); // line 2\n` +
                `// line 3\n` +
                `await tab.run(async () => { // line 4 / 1\n` +
                `    // line 5 / 2\n` +
                `    throw new Error("Error from test!!") // line 6 / 3\n` +
                `    // line 7 / 4\n` +
                `}); // line 8 / 5\n`
            );

            eq(result.error.name, 'Error');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);

            lengthOf(scriptStackFrames, 2);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 4);
            eq(scriptStackFrames[0].columnNumber, 7); // Position of "tab.run"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[1].lineNumber, 3);
            eq(scriptStackFrames[1].columnNumber, 11); // Position of "new Error"
            eq(scriptStackFrames[1].runnerScriptContext, 'content');
        });

        specify('tab.wait() rejected by a runner content script', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `await tab.navigate('http://localhost:${testServerPort()}/static/textOnly.html'); // line 2\n` +
                `// line 3\n` +
                `await tab.wait( // line 4\n` +
                `    () => Promise.reject(Error('Error from test!')) // line 5\n` +
                `); // line 6\n`
            );

            eq(result.error.name, 'Error');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);

            lengthOf(scriptStackFrames, 2);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 4);
            eq(scriptStackFrames[0].columnNumber, 7); // Position of "tab.wait"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[1].lineNumber, 1);
            // columnNumber is not tested here; a correct columnNumber is not guaranteed on the first line
            eq(scriptStackFrames[1].runnerScriptContext, 'content');
        });

        specify('tab.waitForNewPage() rejected by a runner content script', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `await tab.navigate('http://localhost:${testServerPort()}/static/textOnly.html'); // line 2\n` +
                `// line 3\n` +
                `await tab.waitForNewPage(() => { // line 4\n` +
                `// line 5\n` +
                `    const error = new Error('Error from test!') // line 6\n` +
                `    throw error // line 7\n` +
                `}); // line 8\n`
            );

            eq(result.error.name, 'Error');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);

            lengthOf(scriptStackFrames, 2);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 4);
            eq(scriptStackFrames[0].columnNumber, 7); // Position of "tab.waitForNewPage"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[1].lineNumber, 3);
            eq(scriptStackFrames[1].columnNumber, 19); // Position of "new Error"
            eq(scriptStackFrames[1].runnerScriptContext, 'content');
        });

        specify('tab.waitForNewPage() rejected by a timeout', async () => {
            const result = await runScript(
                `${SCRIPT_INIT} // line 1\n` +
                `await tab.navigate('http://localhost:${testServerPort()}/static/textOnly.html'); // line 2\n` +
                `await tab.waitForNewPage(() => { // line 3\n` +
                `    // line 4\n` +
                `}, null, {timeout: '0.1s'}); // line 5\n`
            );

            eq(result.error.name, 'Openrunner:NewPageWaitTimeoutError');
            const scriptStackFrames = result.error.stackFrames.filter(s => s.runnerScriptContext);

            lengthOf(scriptStackFrames, 1);
            eq(scriptStackFrames[0].fileName, 'integrationTest.js');
            eq(scriptStackFrames[0].lineNumber, 3);
            eq(scriptStackFrames[0].columnNumber, 7); // Position of "tab.waitForNewPage"
            eq(scriptStackFrames[0].runnerScriptContext, 'main');
        });
    });
});
