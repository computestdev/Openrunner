'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
require('chai').use(require('chai-as-promised'));
require('chai').use(require('chai-subset'));
const {assert: {deepEqual: deq, strictEqual: eq, throws, isFunction, isRejected, containSubset}} = require('chai');
const sinon = require('sinon');

const Wait = require('../../utilities/Wait');
const TabContentRPC = require('../../../lib/contentRpc/TabContentRPC');
const explicitPromise = require('../../../lib/explicitPromise');

describe('TabContentRPC', () => {
    let browserRuntime;
    let browserTabs;
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
        };
        browserTabs = {
            onRemoved: {
                addListener: sinon.spy(),
                removeListener: sinon.spy(),
            },
            sendMessage: sinon.spy(() => {
                const [promise, resolve, reject] = explicitPromise();
                sendMessagePromises.push({promise, resolve, reject});
                sendMessageWait.advance();
                return promise;
            }),
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
            isRejected(tabRpc.call('foo'), Error, /instance.*destroyed/i);
        });
    });

    describe('get()', () => {
        it('Should create a RPC instance for the given tab', () => {
            const onRpcInitialize = sinon.spy();
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();
            const tabRpc = rpc.get(123);
            isFunction(tabRpc.call);
            isFunction(tabRpc.method);
            isFunction(tabRpc.methods);
            eq(onRpcInitialize.callCount, 1);
            eq(onRpcInitialize.firstCall.args[0].rpc, tabRpc);
            deq(onRpcInitialize.firstCall.args, [{
                browserTabId: 123,
                rpc: tabRpc,
            }]);
        });
    });

    describe('#call()', () => {
        it('Should validate its arguments', async () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');

            await isRejected(tabRpc.call(123), Error, /first.*argument.*must.*string/i);
            await isRejected(tabRpc.call({timeout: 123}), Error, /first.*argument.*object.*name.*property/i);
        });

        it('Should send browser runtime messages and resolve with the result response', async () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const callPromise = tabRpc.call('foo', {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserTabs.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'my tab id 123',
                {
                    method: 'foo',
                    params: [
                        {
                            bar: 123,
                        },
                    ],
                    rpcContext: 'fooContext',
                },
            ]);

            sendMessagePromises[0].resolve({result: 456});
            eq(await callPromise, 456);
        });

        it('Should send browser runtime messages and reject with the error response', async () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const callPromise = tabRpc.call({name: 'foo'}, {bar: 123});
            await sendMessageWait.waitUntil(1);

            const sendMessageArgs = browserTabs.sendMessage.firstCall.args;
            deq(sendMessageArgs, [
                'my tab id 123',
                {
                    method: 'foo',
                    params: [
                        {
                            bar: 123,
                        },
                    ],
                    rpcContext: 'fooContext',
                },
            ]);

            sendMessagePromises[0].resolve({error: {name: 'FooError', message: 'Error from a unit test'}});
            const err = await isRejected(callPromise, Error, 'Error from a unit test');
            eq(err.name, 'RPCRequestError<FooError>');
        });

        it('Should reject with an error if there are 0 listeners that respond with a promise', async () => {
            browserTabs.sendMessage = sinon.spy(() => undefined);
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const callPromise = tabRpc.call({name: 'foo'}, {bar: 123});
            const err = await isRejected(callPromise, Error, /TabContentRPC.*remote.*call.*foo.*not.*receive.*response.*content/i);
            eq(err.name, 'RPCNoResponse');
        });

        it('Should reject with an error if sendMessage rejects with an error', async () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const callPromise = tabRpc.call({name: 'foo'}, {bar: 123});
            await sendMessageWait.waitUntil(1);
            sendMessagePromises[0].reject(Error('Another error from a unit test111'));
            await isRejected(callPromise, Error, 'Another error from a unit test111');
        });

        describe('timeout', () => {
            let clock;

            beforeEach(() => {
                clock = sinon.useFakeTimers();
            });
            afterEach(() => clock.restore());

            it('Should reject with an error if the response takes longer than the default timeout', async () => {
                const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
                rpc.attach();
                const tabRpc = rpc.get('my tab id 123');
                const callPromise = tabRpc.call('foo', {bar: 123});
                clock.tick(15003);
                await isRejected(callPromise, Error, /TabContentRPC.*remote.*call.*foo.*time.*out.*15003ms/i);
            });

            it('Should reject with an error if the response takes longer than the given timeout', async () => {
                const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
                rpc.attach();
                const tabRpc = rpc.get('my tab id 123');
                const callPromise = tabRpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /TabContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
            });

            it('Should not crash if a result response is returned after the timeout', async () => {
                const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
                rpc.attach();
                const tabRpc = rpc.get('my tab id 123');
                const callPromise = tabRpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /TabContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
                sendMessagePromises[0].resolve({result: 456});
            });

            it('Should not crash if sendMessage rejects after the timeout', async () => {
                const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
                rpc.attach();
                const tabRpc = rpc.get('my tab id 123');
                const callPromise = tabRpc.call({name: 'foo', timeout: 123}, {bar: 456});
                clock.tick(123);
                await isRejected(callPromise, Error, /TabContentRPC.*remote.*call.*foo.*time.*out.*123ms/i);
                sendMessagePromises[0].reject(Error('Error from test!!'));
            });
        });
    });

    describe('method registration and handling of incoming messages', () => {
        it('Should call registered methods when a browser runtime message has been received and return the resolved result', async () => {
            const onRpcInitialize = sinon.spy(({rpc}) => rpc.method('foo', x => Promise.resolve(x * 3)));
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();
            rpc.reinitialize('my tab id 1234');
            eq(onRpcInitialize.callCount, 1);

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            const messageCallbackPromise = onMessageCallback(
                {
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

            eq(typeof messageCallbackPromise.then, 'function');
            deq(await messageCallbackPromise, {result: 369});
            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
            eq(onRpcInitialize.callCount, 1);
        });

        it('Should call registered methods when a browser runtime message has been received and return the rejected error', async () => {
            const fooMethod = async x => {
                const err = Error('Error from a test! ' + x);
                err.name = 'FooError';
                throw err;
            };

            const onRpcInitialize = sinon.spy(({rpc}) => rpc.methods(new Map([['foo', fooMethod]])));

            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();
            rpc.reinitialize('my tab id 1234');
            eq(onRpcInitialize.callCount, 1);

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            const messageCallbackPromise = onMessageCallback(
                {
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

            eq(typeof messageCallbackPromise.then, 'function');
            const response = await messageCallbackPromise;
            deq(Object.keys(response), ['error']);
            containSubset(response.error, {
                name: 'FooError',
                message: 'Error from a test! 123',
            });

            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
            eq(onRpcInitialize.callCount, 1);
        });

        it('Should automatically create a TabContentRPCTab instance when a message is received for a tab', async () => {
            const onRpcInitialize = sinon.spy(({rpc}) => rpc.method('foo', x => Promise.resolve(x * 3)));
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();
            // note: the id 'my tab id 1234' is not initialized before receiving the message

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            const messageCallbackPromise = onMessageCallback(
                {
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

            eq(typeof messageCallbackPromise.then, 'function');
            deq(await messageCallbackPromise, {result: 369});
            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
            eq(onRpcInitialize.callCount, 1);
        });

        it('Should ignore browser runtime messages that did not originate from our content script and rpc context', async () => {
            const onRpcInitialize = sinon.spy(({rpc}) => rpc.method('foo', x => Promise.resolve(x * 3)));
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext', onRpcInitialize});
            rpc.attach();

            const onMessageCallback = browserRuntime.onMessage.addListener.firstCall.args[0];
            {
                const messageCallbackPromise = onMessageCallback(
                    {
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
                eq(messageCallbackPromise, undefined);
            }
            {
                const messageCallbackPromise = onMessageCallback(
                    {
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
                eq(messageCallbackPromise, undefined);
            }
            {
                const messageCallbackPromise = onMessageCallback(
                    {
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
                eq(messageCallbackPromise, undefined);
            }
            {
                const messageCallbackPromise = onMessageCallback(
                    {
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
                eq(messageCallbackPromise, undefined);
            }
            {
                const messageCallbackPromise = onMessageCallback(
                    null, // invalid
                    {
                        id: 'openrunner@computest.nl',
                        tab: {
                            id: 'my tab id 1234',
                        },
                        frameId: 0,
                        url: 'https://computest.nl/',
                    },
                );
                eq(messageCallbackPromise, undefined);
            }

            eq(browserTabs.sendMessage.callCount, 0);
            eq(onRpcInitialize.callCount, 0);
            eq(rpc.get('my tab id 1234'), onRpcInitialize.firstCall.args[0].rpc);
        });

        it('Should cleanup the rpc instance if a tab gets removed', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const tabRpc = rpc.get('my tab id 123');
            const onRemoveListener = browserTabs.onRemoved.addListener.firstCall.args[0];
            onRemoveListener('my tab id 123', {});

            isRejected(tabRpc.call('foo'), Error, /instance.*destroyed/i);
            eq(rpc.rpcByTabBrowserId.size, 0);
        });

        it('Should not crash if an unrelated tab gets removed', () => {
            const rpc = new TabContentRPC({browserRuntime, browserTabs, context: 'fooContext'});
            rpc.attach();
            const onRemoveListener = browserTabs.onRemoved.addListener.firstCall.args[0];
            eq(rpc.rpcByTabBrowserId.size, 0);
            onRemoveListener('my tab id 123', {});
            eq(rpc.rpcByTabBrowserId.size, 0);
        });
    });
});
