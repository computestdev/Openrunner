'use strict';
const Promise = require('bluebird');

const log = require('../logger')({MODULE: 'FirefoxDebuggingClient'});
const FirefoxDebuggingConnection = require('./FirefoxDebuggingConnection');

const RETRY_INTERVAL = 500;
const MAX_RETRIES = 25;

const connectWithRetries = async (port) => {
    for (let retries = 0; retries <= MAX_RETRIES; retries++) {
        try {
            log.debug({port}, 'Connecting to firefox debugging port...');
            const client = new FirefoxDebuggingConnection();
            await client.connect('localhost', port);
            log.debug({port}, 'Connected!');
            return client;
        }
        catch (err) {
            if (err && err.name === 'FirefoxDebuggingDisconnectedError') {
                const delay = RETRY_INTERVAL;
                log.debug({delay, retries, MAX_RETRIES}, 'Connection to firefox debugging port was refused, trying again after a delay');
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            log.error({err, port}, 'Unexpected error while attempting to connect to firefox debugging port');
            throw err;
        }
    }

    throw Error(`Unable to connect to firefox debugging port after ${MAX_RETRIES + 1} attempts`);
};

const MAXIMUM_ATTEMPTS = 5;

class FirefoxDebuggingClient {
    constructor(debuggingPort) {
        this.debuggingPort = debuggingPort;
        this._stopped = false;
        this._attemptBusy = false;
        this._client = null;
        // RootActor: https://searchfox.org/mozilla-central/source/devtools/server/actors/root.js
        this._rootActor = null;
        Object.seal(this);
    }

    async start() {
        await this._connect();
    }

    async stop() {
        this._stopped = true;
        this._disconnect();
    }

    async _connect() {
        this._disconnect();

        const client = await connectWithRetries(this.debuggingPort);
        const rootActor = await client.request({to: 'root', type: 'getRoot'});
        this._client = client;
        this._rootActor = rootActor;

        client.once('disconnect', () => {
            if (this._client === client) {
                this._markDisconnected();
            }
        });
    }

    _disconnect() {
        if (this._client) {
            this._client.disconnect();
        }
        this._markDisconnected();
    }

    _markDisconnected() {
        this._client = null;
        this._rootActor = null;
    }

    async _attempt(callback) {
        if (this._attemptBusy) {
            throw Error('Methods on FirefoxDebuggingClient should not be called concurrently');
        }
        this._attemptBusy = true;

        try {
            let lastError = null;

            for (let attempt = 0; attempt < MAXIMUM_ATTEMPTS && !this._stopped; ++attempt) {
                try {
                    if (!this._client) {
                        await this._connect();
                    }
                    return await callback(this._client, this._rootActor);
                }
                catch (err) {
                    // disconnected/timeout during the execution of the command
                    if (err.name === FirefoxDebuggingConnection.ERROR_DISCONNECTED) {
                        this._markDisconnected();
                        lastError = err;
                        continue;
                    }
                    throw err;
                }
            }

            throw lastError;
        }
        finally {
            this._attemptBusy = false;
        }
    }

    async installAddon(path) {
        await this._attempt(async (client, rootActor) => {
            log.info({path}, 'Installing addon...');

            const {addonsActor} = rootActor;
            if (!addonsActor) {
                throw Error('The add-ons actor is not available. This version of firefox is probably too old');
            }

            const response = await client.request({
                to: addonsActor,
                type: 'installTemporaryAddon',
                addonPath: path,
            });
            // response looks like:
            // {"addon":{"id":"openrunner@computest.nl","actor":false},"from":"server1.conn0.addonsActor3"}
            log.info({path, response}, 'Addon installed');
        });
    }
}

module.exports = FirefoxDebuggingClient;

