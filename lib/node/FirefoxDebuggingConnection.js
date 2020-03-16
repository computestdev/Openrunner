'use strict';
const net = require('net');
const Promise = require('bluebird');
const {assert} = require('chai');
const EventEmitter = require('events');

const explicitPromise = require('../explicitPromise');
const log = require('../logger')({MODULE: 'FirefoxDebuggingConnection'});

const KEEP_ALIVE_TIMEOUT = 4000;
const CONNECTION_TIMEOUT = 2000;
const REQUEST_TIMEOUT = 8000;

const BEFORE_CONNECT = 'before connect';
const CONNECTING = 'connecting';
const CONNECTED = 'connected';
const DISCONNECTED = 'disconnected';

const ERROR_DISCONNECTED = 'FirefoxDebuggingDisconnectedError';
const ERROR_RESPONSE = 'FirefoxDebuggingErrorResponseError';

function disconnectError(reason, cause) {
    const error = Error(`Socket disconnected because of ${reason}${cause ? ': ' + cause : ''}`);
    error.name = ERROR_DISCONNECTED;
    error.cause = cause || null;
    return error;
}

class FirefoxDebuggingConnection extends EventEmitter {
    // https://docs.firefox-dev.tools/backend/protocol.html
    constructor({createConnection = net.createConnection} = {}) {
        super();
        this.socket = null;
        this._createConnection = createConnection;
        this._connectTimeout = null;
        this._serverHelloMessage = null;
        this._disconnectExplicitPromise = explicitPromise();
        this._disconnectExplicitPromise.promise.catch(() => {}); // avoid UnhandledPromiseRejectionWarning
        /** @type {'before connect' | 'connecting' | 'connected' | 'disconnected'} */
        this._state = BEFORE_CONNECT;
        this._incomingBuffer = Buffer.alloc(0);
        this._pendingRequests = new Map();
        Object.seal(this);
    }

    get serverHelloMessage() {
        return this._serverHelloMessage;
    }

    get state() {
        return this._state;
    }

    _setState(newState) {
        const isValid = (oldState, newState) => {
            switch (oldState) {
                case BEFORE_CONNECT:
                    return newState === CONNECTING || newState === DISCONNECTED;
                case CONNECTING:
                    return newState === CONNECTED || newState === DISCONNECTED;
                case CONNECTED:
                    return newState === DISCONNECTED;
            }
            /* istanbul ignore next */
            return false;
        };

        const oldState = this.state;

        /* istanbul ignore if */
        if (!isValid(oldState, newState)) {
            throw Error(`Invalid state transition from ${oldState} to ${newState}`);
        }

        this._state = newState;
    }

    _markDisconnected(reason) {
        const oldState = this.state;
        if (oldState === DISCONNECTED) {
            return;
        }

        this._setState(DISCONNECTED);

        if (oldState !== BEFORE_CONNECT) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
            const {reject} = this._disconnectExplicitPromise;
            reject(reason);
            log.info({err: reason}, 'Disconnected');
            this.emit('disconnected', reason);
        }
    }

    async connect(host, port) {
        assert.strictEqual(this.state, BEFORE_CONNECT, 'FirefoxDebuggingConnection#connect() Invalid state');

        this._setState(CONNECTING);
        const socket = this._createConnection({
            port,
            host,
        });
        this.socket = socket;
        socket.setKeepAlive(true, KEEP_ALIVE_TIMEOUT);

        socket.on('data', this._handleData.bind(this));
        socket.on('error', err => {
            log.info({err, host, port}, 'error event from socket');
            this._markDisconnected(disconnectError('error event from socket', err));
        });
        socket.on('end', () => {
            log.info({host, port}, 'end event from socket');
            this._markDisconnected(disconnectError('end event from socket'));
        });

        /* The server sends this message to us right after connecting, example:
         * {
         *   from: 'root',
         *   applicationType: 'browser',
         *   testConnectionPrefix: 'server1.conn0.',
         *   traits: {
         *     sources: true,
         *     networkMonitor: true,
         *     storageInspector: true,
         *     wasmBinarySource: true,
         *     bulk: true,
         *     webConsoleCommands: true,
         *     allowChromeProcess: true,
         *     heapSnapshots: true,
         *     perfActorVersion: 1,
         *     watchpoints: true
         *   }
         * }
        */
        const serverHelloMessagePromise = this._expectReply('root', null);
        serverHelloMessagePromise.catch(() => {}); // avoid UnhandledPromiseRejectionWarning
        const {promise: disconnectPromise} = this._disconnectExplicitPromise;

        this._connectTimeout = setTimeout(() => {
            this.disconnect(disconnectError('Connection attempt timed out'));
        }, CONNECTION_TIMEOUT);

        const connectPromise = new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);

        }).catch(err => {
            this._markDisconnected(disconnectError('error event from socket while waiting for connect event', err));
        });

        await Promise.race([disconnectPromise, connectPromise]);
        clearTimeout(this._connectTimeout);

        log.info({host, port}, 'Connection established');

        this.socket = socket;
        const helloMessage = await Promise.race([disconnectPromise, serverHelloMessagePromise]);
        this._serverHelloMessage = helloMessage;
        this._setState(CONNECTED);
        log.info({host, port, helloMessage}, 'Received hello packet');
    }

    /**
     * @param {Error?} reason
     */
    disconnect(reason) {
        if (this.socket) {
            this.socket.end();
        }
        this._markDisconnected(reason || Error('Explicit call to .disconnect()'));
    }

    _handleData(buffer) {
        if (this.state !== CONNECTING && this.state !== CONNECTED) {
            return;
        }

        try {
            this._incomingBuffer = Buffer.concat([this._incomingBuffer, buffer]);
            while (this._consumeIncomingBuffer()) {}
        }
        catch (err) {
            log.error({err}, 'Unable to parse incoming data');
            this.disconnect(disconnectError('unable to parse incoming data', err));
        }
    }

    _consumeIncomingBuffer() {
        // A JSON packet has the form:
        //    length:JSON
        // where length is a series of decimal ASCII digits, JSON is a well-formed JSON text (as defined in RFC 4627) encoded in UTF-8,
        // and length, interpreted as a number, is the length of JSON in bytes.

        // todo: implement Bulk Data Packets (if we need them) as those will cause an error here

        const buf = this._incomingBuffer;
        const sepPosition = buf.indexOf(0x3A); // ":".charCodeAt(0) == 0x3A
        if (sepPosition < 0) {
            return false;
        }
        const messageLengthStr = buf.slice(0, sepPosition);
        const messageLength = parseInt(messageLengthStr, 10);
        assert(!Number.isNaN(messageLength), 'Invalid message length prefix');
        const messageStartPos = sepPosition + 1; // inclusive
        const messageEndPos = messageStartPos + messageLength; // exclusive
        if (messageEndPos > buf.length) {
            // have not yet received the whole message
            return false;
        }
        const messageStr = buf.slice(messageStartPos, messageEndPos);
        this._incomingBuffer = buf.slice(messageEndPos);
        const message = JSON.parse(messageStr.toString('utf8'));
        this._handleMessage(message);
        return true;
    }

    _handleMessage(message) {
        const {from} = message;
        if (!from) {
            log.error({message}, 'Server did not specify an actor');
            return;
        }

        if ('type' in message) {
            // assume this is a notification packet
            this.emit('notification', message);
        }
        else {
            // reply packet to a request

            const pending = (this._pendingRequests.get(from) || []).shift();
            if (!pending) {
                log.error({message}, 'Received unexpected response packet');
                return;
            }

            if (message.error) {
                log.error({message}, 'Error from firefox debugging protocol');

                const err = Error(`Error from firefox debugging protocol: ${message.error}: ${message.message}`);
                err.name = ERROR_RESPONSE;
                err.data = {firefoxDebuggingMessage: message};

                pending.reject(err);
            }

            pending.resolve(message);
        }
    }

    _sendMessage(message) {
        const messageStr = JSON.stringify(message);
        const messageBuf = Buffer.from(messageStr, 'utf8');
        const packet = Buffer.concat([
            Buffer.from(messageBuf.length.toString(10), 'ascii'),
            Buffer.from(':', 'ascii'),
            messageBuf,
        ]);
        this.socket.write(packet);
    }

    async _expectReply(actor, type) {
        assert(typeof actor === 'string' && actor, 'FirefoxDebuggingConnection#request message has no destination');
        assert(typeof actor === 'string' && actor);

        let pendingArray = this._pendingRequests.get(actor);
        if (!pendingArray) {
            pendingArray = [];
            this._pendingRequests.set(actor, pendingArray);
        }

        const {promise, resolve, reject} = explicitPromise();
        pendingArray.push({resolve, reject});

        const timeout = setTimeout(() => {
            // There is no way to recover from a request for which a result never comes, because the protocol suffers from head of
            // line blocking.
            // This can occur sometimes for a listTabs request, and it seems like the only way to recover from this, is to reconnect.
            this.disconnect(disconnectError(
                `Request for "${type}" to "${actor}" did not receive a response within ${REQUEST_TIMEOUT / 1000} seconds`,
            ));
            // this.disconnect() will cause the the disconnectPromise below to reject

        }, REQUEST_TIMEOUT);

        try {
            const {promise: disconnectPromise} = this._disconnectExplicitPromise;
            return await Promise.race([disconnectPromise, promise]);
        }
        finally {
            clearTimeout(timeout);
        }
    }

    async request(message) {
        assert.strictEqual(this.state, CONNECTED, 'FirefoxDebuggingConnection#request() Invalid state');
        const promise = this._expectReply(message.to, message.type || null);
        this._sendMessage(message);
        return await promise;
    }
}

FirefoxDebuggingConnection.ERROR_DISCONNECTED = ERROR_DISCONNECTED;
FirefoxDebuggingConnection.ERROR_RESPONSE = ERROR_RESPONSE;

module.exports = FirefoxDebuggingConnection;
