'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, strictEqual: eq, throws, isFunction}} = require('chai');
const sinon = require('sinon');

const Wait = require('../utilities/Wait');
const TabContentRPC = require('../../lib/TabContentRPC');

describe('TabContentRPC', () => {
    let browserRuntime;
    let browserTabs;
    let sendMessageWait;

    beforeEach(() => {
        sendMessageWait = new Wait();
        browserRuntime = {
            onMessage: {
                addListener: sinon.spy(),
                removeListener: sinon.spy(),
            },
        };
        browserTabs = {
            onRemoved: {
                addListener: sinon.spy(),
                removeListener: sinon.spy(),
            },
            sendMessage: sinon.spy(() => sendMessageWait.advance()),
        };
    });

    describe('constructor', () => {
        it('Should not have any side effects', () => {
            new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            eq(browserRuntime.onMessage.addListener.callCount, 0);
            eq(browserRuntime.onMessage.removeListener.callCount, 0);
            eq(browserTabs.onRemoved.addListener.callCount, 0);
            eq(browserTabs.onRemoved.removeListener.callCount, 0);
            eq(browserTabs.sendMessage.callCount, 0);
        });

        it('Should throw for invalid arguments', () => {
            throws(() => new TabContentRPC({browserRuntime}), /invalid.*context/i);
            throws(() => new TabContentRPC({browserRuntime, context: {}}), /invalid.*context/i);
            throws(() => new TabContentRPC({browserRuntime, context: ''}), /invalid.*context/i);
        });
    });

    describe('attach()', () => {
        it('Should add event listeners to handle sending and receiving messages', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            eq(browserRuntime.onMessage.addListener.callCount, 1);
            eq(browserRuntime.onMessage.removeListener.callCount, 0);
            eq(browserTabs.onRemoved.addListener.callCount, 1);
            eq(browserTabs.onRemoved.removeListener.callCount, 0);
            eq(browserTabs.sendMessage.callCount, 0);
        });
    });

    describe('detach()', () => {
        it('Should remove event listeners previously added by attach()', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            rpc.detach();
            eq(browserRuntime.onMessage.addListener.callCount, 1);
            eq(browserRuntime.onMessage.removeListener.callCount, 1);
            eq(browserTabs.onRemoved.addListener.callCount, 1);
            eq(browserTabs.onRemoved.removeListener.callCount, 1);
            eq(browserTabs.sendMessage.callCount, 0);
            eq(browserRuntime.onMessage.addListener.firstCall.args[0], browserRuntime.onMessage.removeListener.firstCall.args[0]);
            eq(browserTabs.onRemoved.addListener.firstCall.args[0], browserTabs.onRemoved.removeListener.firstCall.args[0]);
        });

        it('Should cleanup created rpc instances', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            rpc.detach();
            eq(tabRpc.listenerCount('data'), 0);
            eq(rpc.rpcByTabBrowserId.size, 0);
        });
    });

    describe('get()', () => {
        it('Should create a RPC instance for the given tab', () => {
            const onRpcInitialize = sinon.spy();
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();
            const tabRpc = rpc.get(123);
            isFunction(tabRpc.call);
            isFunction(tabRpc.notify);
            isFunction(tabRpc.method);
            isFunction(tabRpc.methods);
            isFunction(tabRpc.notification);
            isFunction(tabRpc.notifications);
            eq(tabRpc.listenerCount('data'), 1);
            eq(tabRpc.listenerCount('error'), 1);
            eq(tabRpc.listenerCount('protocolError'), 1);
            eq(onRpcInitialize.callCount, 1);
            eq(onRpcInitialize.firstCall.args[0].rpc, tabRpc);
            deq(onRpcInitialize.firstCall.args, [{
                browserTabId: 123,
                rpc: tabRpc,
            }]);
        });
    });

    describe('JSON-RPC Handling', () => {
        it('Should send & respond to JSON-RPC packets', async () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const callPromise = tabRpc.call('foo', {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserTabs.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'my tab id 123',
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
                    tab: {
                        id: 'my tab id 123',
                    },
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );

            eq(await callPromise, 456);
        });

        it('Should automatically create a JSONBird instance when a packet is received for a tab', async () => {
            const onRpcInitialize = sinon.spy(({rpc}) => rpc.method('foo', x => Promise.resolve(x * 3)));
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [123],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: {
                        id: 'my tab id 1234',
                    },
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );

            await sendMessageWait.waitUntil(1);
            const sendMessageArgs = browserTabs.sendMessage.firstCall.args;
            eq(browserTabs.sendMessage.callCount, 1);
            deq(sendMessageArgs, [
                'my tab id 1234',
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    result: 369,
                    rpcContext: 'fooContext',
                },
            ]);

            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
            eq(onRpcInitialize.callCount, 1);
        });

        it('Should ignore JSON-RPC packets that did not originate from our content script or rpc context', async () => {
            const onRpcInitialize = sinon.spy(({rpc}) => rpc.method('foo', x => Promise.resolve(x * 3)));
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [453],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunnerXXX@computest.nl', // invalid
                    tab: {
                        id: 'my tab id 1234',
                    },
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [674],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: {
                        id: 'my tab id 1234',
                    },
                    frameId: 123, // invalid
                    url: 'https://computest.nl/',
                },
            );
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [345],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: null, // invalid
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [63],
                    rpcContext: 'barContext', // invalid
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: {
                        id: 'my tab id 1234',
                    },
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );
            onMessageCallback(
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    method: 'foo',
                    params: [123],
                    rpcContext: 'fooContext',
                },
                {
                    id: 'openrunner@computest.nl',
                    tab: {
                        id: 'my tab id 1234',
                    },
                    frameId: 0,
                    url: 'https://computest.nl/',
                },
            );

            await sendMessageWait.waitUntil(1);
            const sendMessageArgs = browserTabs.sendMessage.firstCall.args;
            eq(browserTabs.sendMessage.callCount, 1);
            deq(sendMessageArgs, [
                'my tab id 1234',
                {
                    jsonrpc: '2.0',
                    id: 'foo 123124',
                    result: 369,
                    rpcContext: 'fooContext',
                },
            ]);

            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
            eq(onRpcInitialize.callCount, 1);
        });

        it('Should cleanup the rpc instance if a tab gets removed', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const onRemoveListener = browserTabs.onRemoved.addListener.firstCall.args[0];
            onRemoveListener('my tab id 123', {});

            eq(tabRpc.listenerCount('data'), 0);
            eq(rpc.rpcByTabBrowserId.size, 0);
        });
    });
});
