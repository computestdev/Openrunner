'use strict';
const sinon = require('sinon');
const {assert: {strictEqual: eq, deepEqual: deq}} = require('chai');
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const EventEmitter = require('events');

const delay = require('../../../lib/delay');
const PromiseFateTracker = require('../../utilities/PromiseFateTracker');
const FirefoxDebuggingConnection = require('../../../lib/node/FirefoxDebuggingConnection');

const helloPacket = () => '43:{"from":"root","applicationType":"browser"}';
const helloPacketParsed = () => ({from: 'root', applicationType: 'browser'});

const notificationPacket = () => '39:{"from":"root","type":"tabListChanged"}';
const notificationPacketParsed = () => ({from: 'root', type: 'tabListChanged'});

describe('FirefoxDebuggingConnection', {slow: 1000}, () => {
    let createConnection;
    let socket;
    let wrote;
    let connection;
    let fates;
    let notifications;
    let disconnectEvents;

    const sendToClient = (str) => {
        socket.emit('data', Buffer.from(str, 'utf8'));
    };

    beforeEach(() => {
        wrote = Buffer.alloc(0);
        socket = new EventEmitter();
        socket.setKeepAlive = sinon.spy();
        socket.end = sinon.spy();
        socket.write = sinon.spy(buf => {
            wrote = Buffer.concat([wrote, buf]);
        });
        createConnection = sinon.spy(() => socket);
        connection = new FirefoxDebuggingConnection({createConnection});
        fates = new PromiseFateTracker();

        notifications = [];
        disconnectEvents = 0;
        connection.on('notification', message => { notifications.push(message); });
        connection.on('disconnected', () => { ++disconnectEvents; });
    });

    afterEach(() => connection.disconnect(Error('Disconnected by afterEach() from test suite')));

    describe('constructor()', () => {
        it('Should initialize without side effects', () => {
            eq(connection.state, 'before connect');
            eq(connection.serverHelloMessage, null);
            eq(createConnection.callCount, 0);
            eq(connection.state, 'before connect');
        });
    });

    describe('Connection', () => {
        describe('#connect()', () => {
            it('Should create a new socket', async () => {
                eq(connection.state, 'before connect');
                fates.track('a', connection.connect('example.com', 1234));
                eq(connection.state, 'connecting');
                deq(createConnection.args, [[{host: 'example.com', port: 1234}]]);
                deq(socket.setKeepAlive.args, [[true, 4000]]);

                await delay(100);
                fates.assertPending('a');

                socket.emit();
            });

            it('Should wait for the connection to be established and for the first message', async () => {
                fates.track('a', connection.connect('example.com', 1234));
                eq(connection.state, 'connecting');
                socket.emit('connect');
                await delay(100);
                fates.assertPending('a');
                eq(connection.state, 'connecting');

                sendToClient(helloPacket());
                await fates.waitForAllSettled();
                fates.assertResolved('a');
                eq(connection.state, 'connected');
                deq(connection.serverHelloMessage, helloPacketParsed());
            });

            it('Should be callable only once', async () => {
                fates.track('a', connection.connect('example.com', 1234));
                fates.track('b', connection.connect('example.com', 1234));

                socket.emit('connect');
                await delay(10);
                fates.track('c', connection.connect('example.com', 1234));

                sendToClient(helloPacket());
                await fates.waitForAllSettled();
                fates.track('d', connection.connect('example.com', 1234));
                await fates.waitForAllSettled();

                fates.assertResolved('a');
                fates.assertRejected('b', Error, /invalid state/i);
                fates.assertRejected('c', Error, /invalid state/i);
                fates.assertRejected('d', Error, /invalid state/i);

                connection.disconnect(Error('Explicit disconnect during unit test'));
                fates.track('e', connection.connect('example.com', 1234));
                eq(connection.state, 'disconnected');

                await fates.waitForAllSettled();
                fates.assertRejected('e', Error, /invalid state/i);
            });

            it('Should reject if an error event is emitted while connecting', async () => {
                fates.track('a', connection.connect('example.com', 1234));
                socket.emit('error', Error('Error from a unittest'));
                await fates.waitForAllSettled();
                fates.assertRejected('a', Error, /Error from a unittest/);
                eq(connection.state, 'disconnected');
            });

            it('Should reject if connecting takes too long', async () => {
                const clock = sinon.useFakeTimers();
                try {
                    fates.track('a', connection.connect('example.com', 1234));
                    clock.tick(2000);
                    await fates.waitForAllSettled();
                    fates.assertRejected('a', Error, /connect.*time.*out/i);
                    eq(connection.state, 'disconnected');
                }
                finally {
                    clock.restore();
                }
            });

            it('Should reject if receiving the hello packet takes too long', async () => {
                const clock = sinon.useFakeTimers();
                try {
                    fates.track('a', connection.connect('example.com', 1234));
                    socket.emit('connect');
                    clock.tick(2000);
                    await fates.waitForAllSettled();
                    fates.assertRejected('a', Error, /connect.*time.*out/i);
                    eq(connection.state, 'disconnected');
                }
                finally {
                    clock.restore();
                }
            });
        });

        describe('#disconnect()', () => {
            it('Should mark the connection as invalid if called before a connection attempt', async () => {
                eq(connection.state, 'before connect');
                connection.disconnect(Error('Explicit disconnect during unit test'));
                eq(disconnectEvents, 0); // should not emit the vent because we never attempted to connect
                eq(connection.state, 'disconnected');

                fates.track('a', connection.connect('example.com', 1234));
                await fates.waitForAllSettled();
                fates.assertRejected('a', Error, /invalid state/i);
                eq(disconnectEvents, 0);
            });

            it('Should cancel an ongoing connection attempt (before connect event)', async () => {
                eq(connection.state, 'before connect');

                fates.track('a', connection.connect('example.com', 1234));
                eq(connection.state, 'connecting');
                connection.disconnect(Error('Explicit disconnect during unit test'));
                eq(socket.end.callCount, 1);
                eq(disconnectEvents, 1);
                eq(connection.state, 'disconnected');

                await fates.waitForAllSettled();
                fates.assertRejected('a', Error, /Explicit disconnect during unit test/i);
                eq(connection.state, 'disconnected');

                // all of this should be ignored:
                socket.emit('connect');
                await delay(10);
                eq(connection.state, 'disconnected');

                sendToClient(helloPacket());
                sendToClient(notificationPacket());
                await delay(10);
                eq(connection.state, 'disconnected');
                deq(notifications, []);
                eq(connection.serverHelloMessage, null);
            });

            it('Should cancel an ongoing connection attempt (default disconnect reason)', async () => {
                eq(connection.state, 'before connect');

                fates.track('a', connection.connect('example.com', 1234));
                eq(connection.state, 'connecting');
                connection.disconnect();
                eq(socket.end.callCount, 1);
                eq(disconnectEvents, 1);
                eq(connection.state, 'disconnected');

                await fates.waitForAllSettled();
                fates.assertRejected('a', Error, /Explicit call.*disconnect/i);
                eq(connection.state, 'disconnected');
            });

            it('Should cancel an ongoing connection attempt (after connect event)', async () => {
                eq(connection.state, 'before connect');

                fates.track('a', connection.connect('example.com', 1234));
                eq(connection.state, 'connecting');

                socket.emit('connect');
                await delay(10);

                connection.disconnect(Error('Explicit disconnect during unit test'));
                eq(socket.end.callCount, 1);
                eq(disconnectEvents, 1);
                eq(connection.state, 'disconnected');

                await fates.waitForAllSettled();
                fates.assertRejected('a', Error, /disconnect/i);
                eq(connection.state, 'disconnected');

                sendToClient(helloPacket());
                sendToClient(notificationPacket());
                await delay(10);
                eq(connection.state, 'disconnected');
                deq(notifications, []);
                eq(connection.serverHelloMessage, null);
            });

            it('Should end the socket', async () => {
                fates.track('a', connection.connect('example.com', 1234));
                socket.emit('connect');
                sendToClient(helloPacket());
                await fates.waitForAllSettled();
                fates.assertResolved('a');
                eq(connection.state, 'connected');

                connection.disconnect(Error('Explicit disconnect during unit test'));
                eq(socket.end.callCount, 1);
                eq(connection.state, 'disconnected');
                eq(disconnectEvents, 1);
            });
        });

        it('Should set the state to disconnected if an error occurs on the socket', async () => {
            const connectPromise = connection.connect('example.com', 1234);
            socket.emit('connect');
            sendToClient(helloPacket());
            await connectPromise;
            eq(connection.state, 'connected');

            socket.emit('error', Error('An error from a unittest'));
            eq(connection.state, 'disconnected');
            eq(socket.end.callCount, 0);
        });

        it('Should set the state to disconnected if the other end closes the socket', async () => {
            const connectPromise = connection.connect('example.com', 1234);
            socket.emit('connect');
            sendToClient(helloPacket());
            await connectPromise;
            eq(connection.state, 'connected');

            socket.emit('end');
            eq(connection.state, 'disconnected');
            eq(socket.end.callCount, 0);
        });
    });

    describe('request/reply/notify', () => {
        beforeEach(async () => {
            const connectPromise = connection.connect('example.com', 1234);
            socket.emit('connect');
            sendToClient(helloPacket());
            await connectPromise;
            eq(connection.state, 'connected');
        });

        describe('#request()', () => {
            it('Should immediately send a packet to the socket', () => {
                fates.track('a', connection.request({to: 'root', type: 'getRoot'}));
                deq(wrote.toString('utf8'), '30:{"to":"root","type":"getRoot"}');

                fates.track('b', connection.request({to: 'root', type: 'listTabs'}));
                fates.track('c', connection.request({to: 'addonsbla', type: 'installTemporaryAddon', addonPath: '/etc/passwd'}));
                deq(
                    wrote.toString('utf8'),
                    '30:{"to":"root","type":"getRoot"}31:{"to":"root","type":"listTabs"}' +
                    '75:{"to":"addonsbla","type":"installTemporaryAddon","addonPath":"/etc/passwd"}',
                );
            });

            it('Should resolve when a response packet is received', async () => {
                const firstResult = fates.track('a', connection.request({to: 'root', type: 'getRoot'}));
                const secondResult = fates.track('b', connection.request({to: 'root', type: 'getRoot'}));

                await delay(10);
                fates.assertPending('a');
                fates.assertPending('b');

                sendToClient(
                    '58:{"from":"root","addonsActor":"server1.conn0.addonsActor3"}' +
                    '78:{"from":"root","heapSnapshotFileActor":"server1.conn0.heapSnapshot',
                );
                deq(
                    await firstResult,
                    {from: 'root', addonsActor: 'server1.conn0.addonsActor3'},
                );

                sendToClient('FileActor5"}');
                deq(
                    await secondResult,
                    {from: 'root', heapSnapshotFileActor: 'server1.conn0.heapSnapshotFileActor5'},
                );
            });

            it('Should reject when an error packet is received', async () => {
                fates.track('a', connection.request({to: 'server1.conn0.addonsActor3', type: 'doSomething'}));
                sendToClient('99:{"from":"server1.conn0.addonsActor3","error":"noSuchActor","message":"This actor no longer exists"}');

                await fates.waitForSettled('a');
                fates.assertRejected('a', Error, /firefox.*debugging.*protocol.*noSuchActor.*This actor no longer exists/i);
            });

            it('Should ignore unexpected response packets', async () => {
                sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor3"}');
                const firstResult = connection.request({to: 'root', type: 'getRoot'});
                sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor4"}');

                deq(
                    await firstResult,
                    {from: 'root', addonsActor: 'server1.conn0.addonsActor4'},
                );
            });

            it('Should ignore unexpected response packets (unexpected actor)', async () => {
                sendToClient('49:{"from":"server1.conn0.addonsActor3","foo":"bar"}');
                const firstResult = connection.request({to: 'root', type: 'getRoot'});
                sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor4"}');

                deq(
                    await firstResult,
                    {from: 'root', addonsActor: 'server1.conn0.addonsActor4'},
                );
            });

            it('Should not resolve with a notification packet', async () => {
                const firstResult = fates.track('a', connection.request({to: 'root', type: 'getRoot'}));

                sendToClient(notificationPacket());
                sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor3"}');

                deq(
                    await firstResult,
                    {from: 'root', addonsActor: 'server1.conn0.addonsActor3'},
                );
            });

            it('Should disconnect if a request does not receive a reply after 8 seconds', async () => {
                const clock = sinon.useFakeTimers();
                try {
                    fates.track('a', connection.request({to: 'root', type: 'getRoot'}));
                    clock.tick(8000);
                    await fates.waitForAllSettled();
                    fates.assertRejected('a', Error, /Request.*"getRoot" to "root".*not receive.*response.*8 sec.*/i);
                    eq(disconnectEvents, 1);
                    eq(connection.state, 'disconnected');
                }
                finally {
                    clock.restore();
                }
            });
        });

        describe('.on("notification, ...)', () => {
            it('Should be emitted for all notify packets, but not reply packets', async () => {
                sendToClient(notificationPacket());
                await delay(10); // todo remove
                deq(notifications, [
                    notificationPacketParsed(),
                ]);

                const firstResult = fates.track('a', connection.request({to: 'root', type: 'getRoot'}));
                sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor3"}');
                sendToClient(notificationPacket());

                deq(notifications, [
                    notificationPacketParsed(),
                    notificationPacketParsed(),
                ]);

                await firstResult;
            });
        });

        it('Should ignore packets that do not specify an actor', async () => {
            const firstResult = connection.request({to: 'root', type: 'getRoot'});
            sendToClient('44:{"addonsActor":"server1.conn0.addonsActor3"}');
            sendToClient('58:{"from":"root","addonsActor":"server1.conn0.addonsActor4"}');

            deq(
                await firstResult,
                {from: 'root', addonsActor: 'server1.conn0.addonsActor4'},
            );
            deq(notifications, []);
        });

        it('Should drop the connection if incoming data can not be parsed as a valid packet', () => {
            sendToClient('foo:bar');
            eq(connection.state, 'disconnected');
            eq(disconnectEvents, 1);
            deq(notifications, []);
        });

        it('Should drop the connection if incoming data can not be parsed as a valid packet', () => {
            sendToClient('7:{"foo":');
            eq(connection.state, 'disconnected');
            eq(disconnectEvents, 1);
            deq(notifications, []);
        });
    });
});
