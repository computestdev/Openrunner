'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
require('chai').use(require('chai-as-promised'));
require('chai').use(require('chai-subset'));
const {assert: {throws, deepEqual: deq, strictEqual: eq, isRejected, containSubset}} = require('chai');
const sinon = require('sinon');

const Wait = require('../../utilities/Wait');
const ContentRPC = require('../../../lib/contentRpc/ContentRPC');
const explicitPromise = require('../../../lib/explicitPromise');

describe('ContentRPC', () => {
    let browserRuntime;
    let sendMessageWait;
    let sendMessagePromises;

    beforeEach(() => {
        sendMessageWait = new Wait();
        sendMessagePromises = [];
        browserRuntime = {
            onMessage: {
                addListener: sinon.spy(),
                removeListener: sinon.spy(),
            },
            sendMessage: sinon.spy(() => {
                const {promise, resolve, reject} = explicitPromise();
                sendMessagePromises.push({promise, resolve, reject});
                sendMessageWait.advance();
                return promise;
            }),
        };
    });

    describe('constructor', () => {
        it('Should not have any side effects', () => {
            new ContentRPC({browserRuntime, context: 'fooContext'});
            eq(browserRuntime.onMessage.addListener.callCount, 0);
            eq(browserRuntime.onMessage.removeListener.callCount, 0);
            eq(browserRuntime.sendMessage.callCount, 0);
        });

        it('Should throw for invalid arguments', () => {
            throws(() => new ContentRPC({browserRuntime}), /invalid.*context/i);
            throws(() => new ContentRPC({browserRuntime, context: {}}), /invalid.*context/i);
            throws(() => new ContentRPC({browserRuntime, context: ''}), /invalid.*context/i);
        });
    });

    describe('attach()', () => {
        it('Should add event listeners to handle sending and receiving messages', () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            eq(browserRuntime.onMessage.addListener.callCount, 1);
            eq(browserRuntime.onMessage.removeListener.callCount, 0);
            eq(browserRuntime.sendMessage.callCount, 0);
        });
    });

    describe('detach()', () => {
        it('Should remove event listeners previously added by attach()', () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            rpc.detach();
            eq(browserRuntime.onMessage.removeListener.callCount, 1);
            eq(browserRuntime.sendMessage.callCount, 0);
            eq(browserRuntime.onMessage.addListener.firstCall.args[0], browserRuntime.onMessage.removeListener.firstCall.args[0]);
        });
    });

    describe('call()', () => {
        it('Should validate its arguments', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();

            await isRejected(rpc.call(123), Error, /first.*argument.*must.*string/i);
            await isRejected(rpc.call({timeout: 123}), Error, /first.*argument.*object.*name.*property/i);
        });

        it('Should send browser runtime messages and resolve with the result response', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const callPromise = rpc.call('foo', {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    method: 'foo',
                    params: [
                        {
                            bar: 123,
                        },
                    ],
                    rpcContext: 'fooContext',
                },
                {},
            ]);

            sendMessagePromises[0].resolve({result: 456});
            eq(await callPromise, 456);
        });

        it('Should send browser runtime messages and reject with the error response', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const callPromise = rpc.call({name: 'foo'}, {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    method: 'foo',
                    params: [
                        {
                            bar: 123,
                        },
                    ],
                    rpcContext: 'fooContext',
                },
                {},
            ]);

            sendMessagePromises[0].resolve({error: {name: 'FooError', message: 'Error from a unit test'}});
            const err = await isRejected(callPromise, Error, 'Error from a unit test');
            eq(err.name, 'RPCRequestError<FooError>');
        });

        it('Should not crash if the error response is falsy', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const callPromise = rpc.call({name: 'foo'});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    method: 'foo',
                    params: [],
                    rpcContext: 'fooContext',
                },
                {},
            ]);

            sendMessagePromises[0].resolve({error: null});
            const err = await isRejected(callPromise);
            eq(err, null);
        });

        it('Should reject with an error if there are 0 listeners that respond with a promise', async () => {
            browserRuntime.sendMessage = sinon.spy(() => undefined);
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const callPromise = rpc.call({name: 'foo'}, {bar: 123});
            const err = await isRejected(callPromise, Error, /ContentRPC.*remote.*call.*foo.*not.*receive.*response.*background/i);
            eq(err.name, 'RPCNoResponse');
        });

        describe('timeout', () => {
            let clock;

            beforeEach(() => {
                clock = sinon.useFakeTimers();
            });
            afterEach(() => clock.restore());

            it('Should reject with an error if the response takes longer than the default timeout', async () => {
                const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
                rpc.attach();
                const callPromise = rpc.call('foo', {bar: 123});
                clock.tick(15004);
                await isRejected(callPromise, Error, /ContentRPC.*remote.*call.*foo.*time.*out.*15004ms/i);
            });

            it('Should reject with an error if the response takes longer than the given timeout', async () => {
                const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
                rpc.attach();
                const callPromise = rpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /ContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
            });

            it('Should not crash if a result response is returned after the timeout', async () => {
                const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
                rpc.attach();
                const callPromise = rpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /ContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
                sendMessagePromises[0].resolve({result: 456});
            });

            it('Should not crash if sendMessage rejects after the timeout', async () => {
                const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
                rpc.attach();
                const callPromise = rpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /ContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
                sendMessagePromises[0].reject(Error('Error from test!!'));
            });
        });
    });

    describe('callAndForget()', () => {
        it('Should ignore rejections', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const returnValue = rpc.callAndForget({name: 'foo'}, {bar: 123});
            eq(returnValue, undefined); // not a promise
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    method: 'foo',
                    params: [
                        {
                            bar: 123,
                        },
                    ],
                    rpcContext: 'fooContext',
                },
                {},
            ]);

            sendMessagePromises[0].resolve({error: {name: 'FooError', message: 'Error from a unit test'}});
        });
    });

    describe('method registration and handling of incoming messages', () => {
        let rpc;
        let onMessageCallback;
        let fooMethod;
        let barMethod;

        beforeEach(() => {
            rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            fooMethod = sinon.spy(a => Promise.resolve(a * 2));
            barMethod = sinon.spy(a => Promise.resolve(a + 2));

            rpc.methods(new Map([['foo', fooMethod]]));
            rpc.method('bar', barMethod);
            rpc.method('baz', async x => {
                const err = Error('Error from a test! ' + x);
                err.name = 'BazError';
                throw err;
            });
        });

        afterEach(() => {
            rpc.detach();
            rpc = null;
        });

        it('Should call registered methods when a browser runtime message has been received and return the resolved result', async () => {
            {
                const messageCallbackPromise = onMessageCallback(
                    {
                        method: 'foo',
                        params: [123],
                        rpcContext: 'fooContext',
                    },
                    {
                        id: 'openrunner@computest.nl',
                        tab: null,
                        url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                    },
                );
                eq(typeof messageCallbackPromise.then, 'function');
                deq(await messageCallbackPromise, {result: 246});
                eq(fooMethod.callCount, 1);
                eq(barMethod.callCount, 0);
            }
            {
                const messageCallbackPromise = onMessageCallback(
                    {
                        method: 'bar',
                        params: [123],
                        rpcContext: 'fooContext',
                    },
                    {
                        id: 'openrunner@computest.nl',
                        tab: null,
                        url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                    },
                );
                eq(typeof messageCallbackPromise.then, 'function');
                deq(await messageCallbackPromise, {result: 125});
                eq(fooMethod.callCount, 1);
                eq(barMethod.callCount, 1);
            }
        });

        it('Should call registered methods when a browser runtime message has been received and return the rejected error', async () => {
            const messageCallbackPromise = onMessageCallback(
                {
                    method: 'baz',
                    params: [321],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: null,
                    url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                },
            );
            eq(typeof messageCallbackPromise.then, 'function');
            const response = await messageCallbackPromise;
            deq(Object.keys(response), ['error']);
            containSubset(response.error, {
                name: 'BazError',
                message: 'Error from a test! 321',
            });
        });

        it('Should ignore browser runtime messages that did not originate from our background script or rpc context', async () => {
            {
                const messageCallbackPromise = onMessageCallback(
                    {
                        method: 'bar',
                        params: [634],
                        rpcContext: 'fooContext',
                    },
                    {
                        id: 'openrunnerXXX@computest.nl',
                        tab: null,
                        url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                    },
                );
                // must be undefined because otherwise we might block the return value from a different listener
                eq(messageCallbackPromise, undefined);
            }

            {
                const messageCallbackPromise = onMessageCallback(
                    {
                        method: 'bar',
                        params: [364],
                        rpcContext: 'fooContext',
                    },
                    {
                        id: 'openrunner@computest.nl',
                        tab: {id: '123'},
                        url: 'https://computest.nl/',
                    },
                );
                eq(messageCallbackPromise, undefined);
            }

            {
                const messageCallbackPromise = onMessageCallback(
                    {
                        method: 'bar',
                        params: [329],
                        rpcContext: 'barContext',
                    },
                    {
                        id: 'openrunner@computest.nl',
                        tab: null,
                        url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                    },
                );
                eq(messageCallbackPromise, undefined);
            }

            {
                const messageCallbackPromise = onMessageCallback(
                    null,
                    {
                        id: 'openrunner@computest.nl',
                        tab: null,
                        url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                    },
                );
                eq(messageCallbackPromise, undefined);
            }

            eq(fooMethod.callCount, 0);
            eq(barMethod.callCount, 0);
        });
    });
});
