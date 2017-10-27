'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const {assert: {throws, deepEqual: deq, strictEqual: eq}} = require('chai');
const sinon = require('sinon');

const Wait = require('../utilities/Wait');
const ContentRPC = require('../../lib/ContentRPC');

describe('ContentRPC', () => {
    let browserRuntime;
    let sendMessageWait;

    beforeEach(() => {
        sendMessageWait = new Wait();
        browserRuntime = {
            onMessage: {
                addListener: sinon.spy(),
                removeListener: sinon.spy(),
            },
            sendMessage: sinon.spy(() => sendMessageWait.advance()),
        };
    });

    describe('constructor', () => {
        it('Should not have any side effects', () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            eq(browserRuntime.onMessage.addListener.callCount, 0);
            eq(browserRuntime.onMessage.removeListener.callCount, 0);
            eq(browserRuntime.sendMessage.callCount, 0);
            eq(rpc.rpc.listenerCount('data'), 0); // attaching the data event on streams has a side effect
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
            eq(rpc.rpc.listenerCount('data'), 1);
            eq(rpc.rpc.listenerCount('error'), 1);
            eq(rpc.rpc.listenerCount('protocolError'), 1);
        });
    });

    describe('detach()', () => {
        it('Should remove event listeners previously added by attach()', () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            rpc.detach();
            eq(browserRuntime.onMessage.removeListener.callCount, 1);
            eq(browserRuntime.sendMessage.callCount, 0);
            eq(rpc.rpc.listenerCount('data'), 0);
            eq(browserRuntime.onMessage.addListener.firstCall.args[0], browserRuntime.onMessage.removeListener.firstCall.args[0]);
        });
    });

    describe('call()', () => {
        it('Should send & respond to JSON-RPC packets', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            const callPromise = rpc.call('foo', {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    jsonrpc: '2.0',
                    id: sendMessageArgs[1].id,
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

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: sendMessageArgs[1].id,
                    result: 456,
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: null,
                    url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                },
            );

            eq(await callPromise, 456);
        });
    });

    describe('notify()', () => {
        it('Should send & respond to JSON-RPC packets', async () => {
            const rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            await rpc.notify('foo', 123);

            const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'openrunner@computest.nl',
                {
                    jsonrpc: '2.0',
                    method: 'foo',
                    params: [123],
                    rpcContext: 'fooContext',
                },
                {},
            ]);
        });
    });

    describe('method registration and calling', () => {
        let rpc;
        let onMessageCallback;
        let fooMethod;
        let barMethod;
        let fooNotification;
        let barNotification;
        let fooNotificationWait;
        let barNotificationWait;

        beforeEach(() => {
            rpc = new ContentRPC({browserRuntime, context: 'fooContext'});
            rpc.attach();
            onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            fooMethod = sinon.spy(a => Promise.resolve(a * 2));
            barMethod = sinon.spy(a => Promise.resolve(a + 2));
            fooNotificationWait = new Wait();
            barNotificationWait = new Wait();
            fooNotification = sinon.spy(() => fooNotificationWait.advance());
            barNotification = sinon.spy(() => barNotificationWait.advance());

            rpc.methods(new Map([['foo', fooMethod]]));
            rpc.method('bar', barMethod);
            rpc.notifications(new Map([['foo', fooNotification]]));
            rpc.notification('bar', barNotification);
        });

        afterEach(() => {
            rpc.detach();
            rpc = null;
        });

        describe('methods()', () => {
            it('Should call registered methods when a JSON-RPC packet has been received', async () => {
                onMessageCallback(
                    {
                        jsonrpc: '2.0',
                        id: 'foo 125982397',
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

                await sendMessageWait.waitUntil(1);
                const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
                deq(sendMessageArgs, [
                    'openrunner@computest.nl',
                    {
                        jsonrpc: '2.0',
                        id: 'foo 125982397',
                        result: 246,
                        rpcContext: 'fooContext',
                    },
                    {},
                ]);
                eq(fooMethod.callCount, 1);
                eq(barMethod.callCount, 0);
                eq(fooNotification.callCount, 0);
                eq(barNotification.callCount, 0);
            });
        });

        describe('method()', () => {
            it('Should call registered methods when a JSON-RPC packet has been received', async () => {
                onMessageCallback(
                    {
                        jsonrpc: '2.0',
                        id: 'bar 3643523',
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

                await sendMessageWait.waitUntil(1);
                const sendMessageArgs = browserRuntime.sendMessage.firstCall.args;
                deq(sendMessageArgs, [
                    'openrunner@computest.nl',
                    {
                        jsonrpc: '2.0',
                        id: 'bar 3643523',
                        result: 125,
                        rpcContext: 'fooContext',
                    },
                    {},
                ]);
                eq(fooMethod.callCount, 0);
                eq(barMethod.callCount, 1);
                eq(fooNotification.callCount, 0);
                eq(barNotification.callCount, 0);
            });
        });

        describe('notifications()', () => {
            it('Should call registered methods when a JSON-RPC packet has been received', async () => {
                onMessageCallback(
                    {
                        jsonrpc: '2.0',
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

                await fooNotificationWait.waitUntil(1);
                eq(fooNotification.callCount, 1);
                deq(fooNotification.firstCall.args, [123]);

                eq(fooMethod.callCount, 0);
                eq(barMethod.callCount, 0);
                eq(fooNotification.callCount, 1);
                eq(barNotification.callCount, 0);
            });
        });

        describe('notification()', () => {
            it('Should call registered methods when a JSON-RPC packet has been received', async () => {
                onMessageCallback(
                    {
                        jsonrpc: '2.0',
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

                await barNotificationWait.waitUntil(1);
                eq(barNotification.callCount, 1);
                deq(barNotification.firstCall.args, [123]);

                eq(fooMethod.callCount, 0);
                eq(barMethod.callCount, 0);
                eq(fooNotification.callCount, 0);
                eq(barNotification.callCount, 1);
            });
        });

        it('Should ignore JSON-RPC packets that did not originate from our background script or rpc context', async () => {
            onMessageCallback(
                {
                    jsonrpc: '2.0',
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

            onMessageCallback(
                {
                    jsonrpc: '2.0',
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

            onMessageCallback(
                {
                    jsonrpc: '2.0',
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

            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    method: 'bar',
                    params: [789],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: null,
                    url: 'moz-extension://b805b490-7609-f843-a357-d82c4fe70fb6/_blank.html',
                },
            );

            await barNotificationWait.waitUntil(1);
            eq(barNotification.callCount, 1);
            deq(barNotification.firstCall.args, [789]);

            eq(fooMethod.callCount, 0);
            eq(barMethod.callCount, 0);
            eq(fooNotification.callCount, 0);
            eq(barNotification.callCount, 1);
        });
    });
});
