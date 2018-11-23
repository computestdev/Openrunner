'use strict';
const {describe, specify} = require('mocha-sugar-free');
const {assert: {lengthOf, strictEqual: eq, oneOf}} = require('chai');

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

    specify('Calling rpc methods on an invalid tab', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');

            const tab = new tabs.Tab(123);
            {
                const err = await assert.isRejected(tab.navigate(injected.url), /navigate.*invalid.*id/i);
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }
            {
                const err = await assert.isRejected(tab.run(() => {}), /run.*invalid.*id/i);
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }
            {
                const err = await assert.isRejected(tab.wait(() => {}), /wait\b.*invalid.*id/i);
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }
            {
                const err = await assert.isRejected(tab.waitForNewPage(() => {}), /waitForNewPage.*invalid.*id/i);
                assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
            }
        }, {url: `http://localhost:${testServerPort()}/headers/html`});
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

    specify('Running a content script once in a cross origin iframe tag', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('wait');
            const tab = await tabs.create();

            await transaction('tabs.frame() should throw for invalid arguments', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const okay = await tab.run(async () => {
                    const check = async arg => {
                        const err = await assert.isRejected(
                            tabs.frame(arg),
                            Error,
                            /tabs.frame.*first.*argument.*must.*iframe.*WindowProxy/i
                        );
                        assert.strictEqual(err.name, 'Openrunner:IllegalArgumentError');
                    };

                    await check(null);
                    await check({});
                    await check(document.body);
                    await check(document.createTextNode('foo'));
                    return 'okay';
                });
                assert.strictEqual(okay, 'okay');
            });

            await transaction('Frame rpc methods should throw for an invalid frame', async () => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const okay = await tab.run(async () => {
                    const frame = new tabs.Frame(123456);
                    await assert.isRejected(frame.run(() => {}), Error, /invalid.*frameId/i);
                    await assert.isRejected(frame.wait(() => {}), Error, /invalid.*frameId/i);
                    await assert.isRejected(frame.waitForNewPage(() => {}), Error, /invalid.*frameId/i);
                    return 'okay';
                });
                assert.strictEqual(okay, 'okay');
            });

            await transaction('find content in frame1, which is present statically with a cross origin src', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const frameBodyId = await tab.run(async () => {
                    const iframe = await wait.documentInteractive().selector('#frame1');
                    const frame = await tabs.frame(iframe, {timeout: '10s'});
                    const frame2 = await tabs.frame(iframe, {timeout: '1s'});
                    const frame3 = await tabs.frame(iframe, {timeout: '1s'});
                    assert(frame2 === frame, 'Multiple invocations with the same argument should return the same Frame object, from cache');
                    assert(frame3 === frame, 'Multiple invocations with the same argument should return the same Frame object, from cache');

                    return await frame.run(async () => {
                        const body = await wait.documentInteractive().selector('body');
                        return body.getAttribute('id');
                    });
                });
                assert.strictEqual(frameBodyId, 'frame1body');
            });

            await transaction('Cross frame content messaging should not interfere with site content, and visa versa', async t => {
                const okay = await tab.run(async () => {
                    const messageNodes = await wait.selectorAll('#messages > p').amount(2);
                    const messages = messageNodes.map(n => JSON.parse(n.textContent));
                    assert.deepEqual(messages, [
                        {foo: 'first hello from frame1.html'},
                        'second hello from frame1.html',
                    ]);

                    const iframe = await wait.documentInteractive().selector('#frame1');
                    const frame = await tabs.frame(iframe, {timeout: '10s'});
                    return await frame.run(async () => {
                        const messageNodes = await wait.selectorAll('#messages > p').amount(2);
                        const messages = messageNodes.map(n => JSON.parse(n.textContent));
                        assert.deepEqual(messages, [
                            {foo: 'first hello from frames.html'},
                            'second hello from frames.html',
                        ]);
                        return 'okay';
                    });
                });
                assert.strictEqual(okay, 'okay');
            });

            await transaction(
                'find content in frame2, which is present statically with about:blank, and get its src replaced ' +
                'with a cross origin src after a timeout',
                async t => {
                    await tab.navigate(injected.url, {timeout: '10s'});
                    const frameBodyId = await tab.run(async () => {
                        const iframe = await wait.documentInteractive().selector('#frame2');
                        const frame = await tabs.frame(iframe, {timeout: '10s'});

                        return await frame.run(async () => {
                            const body = await wait.documentInteractive().selector('body');
                            return body.getAttribute('id');
                        });
                    });
                    assert.strictEqual(frameBodyId, 'frame2body');
                }
            );

            await transaction('find content in frame3, which is added dynamically with a cross origin src after a timeout', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const frameBodyId = await tab.run(async () => {
                    const iframe = await wait.documentInteractive().selector('#frame3');
                    const frame = await tabs.frame(iframe, {timeout: '10s'});

                    return await frame.run(async () => {
                        const body = await wait.documentInteractive().selector('body');
                        return body.getAttribute('id');
                    });
                });
                assert.strictEqual(frameBodyId, 'frame3body');
            });

            await transaction('Handle timeout on frame_blank, which is present statically and always stays on about:blank', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const ret = await tab.run(async () => {
                    const iframe = await wait.documentInteractive().selector('#frame_blank');
                    await assert.isRejected(
                        tabs.frame(iframe, {timeout: '3s'}),
                        Error,
                        /tabs\.frame.*waiting.*content.*document.*iframe.*time.*out.*\b3\b.*second/i
                    );
                    return 123;
                });
                assert.strictEqual(ret, 123);
            });
        }, {url: `http://localhost:${testServerPort()}/frames/frames.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script once in a cross origin object tag', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('wait');
            const tab = await tabs.create();

            await transaction('Find stuff in #frame1', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const frameBodyId = await tab.run(async () => {
                    await wait.documentComplete();
                    // <object> can not yet be used directly, but we can use window[i] or window.frames[i]
                    const frame = await tabs.frame(window.frames[0], {timeout: '10s'});

                    return await frame.run(async () => {
                        const body = await wait.documentInteractive().selector('body');
                        return body.getAttribute('id');
                    });
                });
                assert.strictEqual(frameBodyId, 'frame1body');
            });
        }, {url: `http://localhost:${testServerPort()}/frames/object-html.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script once in a nested iframe tag', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('wait');
            const tab = await tabs.create();

            await transaction('Find stuff in #frames => #frame1', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});

                const frameBodyIds = await tab.run(async () => {
                    const iframe = await wait.documentInteractive().selector('#frames');
                    const frame = await tabs.frame(iframe, {timeout: '10s'});
                    return await frame.run(async () => {
                        const iframes = await wait.documentInteractive().selectorAll('#frame1, #frame2, #frame3').amount(3);
                        return await Promise.all(iframes.map(iframe =>
                            tabs.frame(iframe, {timeout: '10s'}).then(frame => frame.run(async () => {
                                const body = await wait.documentInteractive().selector('body');
                                return body.getAttribute('id');
                            }))
                        ));
                    });
                });
                assert.deepEqual(frameBodyIds, ['frame1body', 'frame2body', 'frame3body']);
            });
        }, {url: `http://localhost:${testServerPort()}/static/frames/nested-frames.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script in a cross origin iframe tag and repeating it if the page navigates away', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('wait');
            const tab = await tabs.create();

            await transaction('Find specific element in #frame1', async t => {
                await tab.navigate(injected.url, {timeout: '10s'});
                const frameBodyId = await tab.run(async () => {
                    const iframe = await wait.documentInteractive().selector('#frame1');
                    const frame = await tabs.frame(iframe, {timeout: '10s'});

                    return await frame.wait(async () => {
                        const body = await wait.documentInteractive().selector('body#frame3body');
                        return body.getAttribute('id');
                    });
                });
                assert.strictEqual(frameBodyId, 'frame3body');
            });
        }, {url: `http://localhost:${testServerPort()}/frames/navigating-frame.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Running a content script in a cross origin firame tag and waiting until it triggers a navigation', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            await include('wait');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                const iframe = await wait.documentInteractive().selector('#frame1');
                const frame = await tabs.frame(iframe, {timeout: '10s'});

                {
                    let waitPromiseResolved = false;
                    const waitPromise = frame.waitForNewPage(async () => {
                        return 123; // the return value should be ignored
                    });
                    waitPromise.then(() => {
                        waitPromiseResolved = true;
                    });

                    await delay(50);
                    assert.isFalse(waitPromiseResolved);

                    await frame.waitForNewPage(async () => {
                        const link = await wait.selector('#gotoframe2');
                        link.click();
                    });
                    assert.strictEqual(await waitPromise, undefined);
                }

                {
                    let waitPromiseResolved = false;
                    const waitPromise = frame.waitForNewPage(async () => {
                        return new Promise(() => {}); // pending
                    });
                    waitPromise.then(() => {
                        waitPromiseResolved = true;
                    });

                    await delay(50);
                    assert.isFalse(waitPromiseResolved);

                    await frame.waitForNewPage(async () => {
                        const link = await wait.selector('#gotoframe3');
                        link.click();
                    });
                    await delay(50);
                    assert.isTrue(waitPromiseResolved);
                    assert.strictEqual(await waitPromise, undefined);
                }
            });


        }, {url: `http://localhost:${testServerPort()}/frames/frames.html`});
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
            // it appears that newer versions of firefox already include the same stack. For now we accept a double stack (until this
            // version of firefox is out of alpha)
            oneOf(scriptStackFrames.length, [1, 2]);
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
            eq(scriptStackFrames[0].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[0].lineNumber, 3);
            eq(scriptStackFrames[0].columnNumber, 11); // Position of "new Error"
            eq(scriptStackFrames[0].runnerScriptContext, 'content');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js');
            eq(scriptStackFrames[1].lineNumber, 4);
            eq(scriptStackFrames[1].columnNumber, 7); // Position of "tab.run"
            eq(scriptStackFrames[1].runnerScriptContext, 'main');
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
            eq(scriptStackFrames[0].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[0].lineNumber, 1);
            // columnNumber is not tested here; a correct columnNumber is not guaranteed on the first line
            eq(scriptStackFrames[0].runnerScriptContext, 'content');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js');
            eq(scriptStackFrames[1].lineNumber, 4);
            eq(scriptStackFrames[1].columnNumber, 7); // Position of "tab.wait"
            eq(scriptStackFrames[1].runnerScriptContext, 'main');
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
            eq(scriptStackFrames[0].fileName, 'integrationTest.js#content');
            eq(scriptStackFrames[0].lineNumber, 3);
            eq(scriptStackFrames[0].columnNumber, 19); // Position of "new Error"
            eq(scriptStackFrames[0].runnerScriptContext, 'content');

            eq(scriptStackFrames[1].fileName, 'integrationTest.js');
            eq(scriptStackFrames[1].lineNumber, 4);
            eq(scriptStackFrames[1].columnNumber, 7); // Position of "tab.waitForNewPage"
            eq(scriptStackFrames[1].runnerScriptContext, 'main');
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

    specify('Changing the window size', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const tabs = await include('tabs');
            const assert = await include('assert');
            const tab = await tabs.create();
            await tab.navigate(injected.url, {timeout: '2s'});

            {
                await tabs.viewportSize({width: 400, height: 500});
                const result = await tab.run(() => {
                    return {
                        innerHeight: window.innerHeight,
                        outerHeight: window.outerHeight,
                        innerWidth: window.innerWidth,
                        outerWidth: window.outerWidth,
                    };
                });
                assert.strictEqual(result.innerWidth, 400);
                assert.strictEqual(result.innerHeight, 500);
                assert.isAtLeast(result.outerWidth, 400);
                assert.isAtLeast(result.outerHeight, 500);
            }

            await assert.isRejected(
                tabs.viewportSize({width: 1, height: 2}),
                Error,
                /tabs.viewportSize.*failed.*set.*viewport.*size.*1x2/i
            );

            await assert.isRejected(
                tabs.viewportSize({width: 10000, height: 500}),
                Error,
                /tabs.viewportSize.*invalid.*width/i
            );

            // make sure that we can recover from the prior errors
            {
                await tabs.viewportSize({width: 700, height: 400});
                const result = await tab.run(() => {
                    return {
                        innerHeight: window.innerHeight,
                        outerHeight: window.outerHeight,
                        innerWidth: window.innerWidth,
                        outerWidth: window.outerWidth,
                    };
                });
                assert.strictEqual(result.innerWidth, 700);
                assert.strictEqual(result.innerHeight, 400);
                assert.isAtLeast(result.outerWidth, 700);
                assert.isAtLeast(result.outerHeight, 400);
            }

        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });
});
