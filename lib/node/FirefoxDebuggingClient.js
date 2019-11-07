'use strict';
const FirefoxClient = require('@cliqz-oss/firefox-client');
const Promise = require('bluebird');

const log = require('../logger')({MODULE: 'FirefoxDebuggingClient'});

const connectOnce = async (port) => {
    const client = new FirefoxClient();
    await new Promise((resolve, reject) => {
        client.connect(port, resolve);
        client.on('error', reject);
        client.on('timeout', reject);
    });
    return client;
};

const RETRY_INTERVAL = 500;
const MAX_RETRIES = 25;
const connectWithRetries = async (port) => {
    for (let retries = 0; retries <= MAX_RETRIES; retries++) {
        try {
            log.debug({port}, 'Connecting to firefox debugging port...');
            const client = await connectOnce(port);
            log.debug({port}, 'Connected!');
            return client;
        }
        catch (err) {
            if (err && err.code === 'ECONNREFUSED') {
                const delay = RETRY_INTERVAL;
                log.debug({delay, retries, MAX_RETRIES}, 'Connection to firefox debugging port was refused, trying again after a delay');
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            log.error({err, port}, 'Unexpected error while attempting to connect to firefox debugging port');
            throw err;
        }
    }

    throw Error('Unable to connect to firefox debugging port after repeated attempts');
};

// RootActor: https://searchfox.org/mozilla-central/source/devtools/server/actors/root.js

class FirefoxDebuggingClient {
    constructor(debuggingPort) {
        this.debuggingPort = debuggingPort;
        this.client = null;
        Object.seal(this);
    }

    async connect() {
        if (this.client) {
            throw Error('Already connected');
        }
        this.client = Symbol('connecting...');
        this.client = await connectWithRetries(this.debuggingPort);
    }

    async disconnect() {
        if (this.client) {
            this.client.disconnect();
        }
        this.client = null;
    }

    async installAddon(path) {
        log.info({path}, 'Installing addon...');
        const {addonsActor} = await Promise.fromCallback(cb => this.client.request('getRoot', cb));
        if (!addonsActor) {
            throw Error('The add-ons actor is not available. This version of firefox is probably too old');
        }

        await new Promise((resolve, reject) => {
            this.client.client.makeRequest({
                to: addonsActor,
                type: 'installTemporaryAddon',
                addonPath: path,
            }, (response) => {
                if (response.error) {
                    log.info({path, response}, 'installTemporaryAddon request failed');
                    reject(Error(`installTemporaryAddon request failed: ${response.error} - ${response.message}`));
                    return;
                }
                log.info({path, response}, 'Addon installed');
                resolve();
            });
        });
    }
}

module.exports = FirefoxDebuggingClient;
