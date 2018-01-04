'use strict';
const WebSocket = require('ws');

const Wait = require('./Wait');
const {WS_CLOSE_NORMAL} = require('../../lib/webSocketCodes');

const cncClient = (port, instanceId = 'cafecafe') => {
    const url =
        `ws://127.0.0.1:${port}/openrunner-cnc?` +
        `instanceId=${instanceId}&` +
        'runnerName=Openrunner&' +
        'runnerVersion=2.1234.5&' +
        'platformOs=mac&' +
        'browserName=Firefox&' +
        'browserVendor=Mozilla&' +
        'browserVersion=58.0&' +
        'browserBuild=20171226085105';

    const ws = new WebSocket(url);
    const client = {
        close: () => new Promise(resolve => {
            if (client.closed) {
                resolve();
            }
            else {
                ws.once('close', resolve);
                ws.close(WS_CLOSE_NORMAL, 'Closed by test');
            }
        }),
        closed: false,
        messages: [],
        pingCount: 0,
        send: obj => new Promise(resolve => ws.send(JSON.stringify(obj), {}, resolve)),
        waitForMessage: new Wait(),
        waitForPing: new Wait(),
        ws,
    };

    ws.on('close', (code, message) => {
        client.closed = {code, message};
    });

    ws.on('message', message => {
        const obj = JSON.parse(message.toString('utf8'));

        if (obj.method === 'jsonbird.ping') {
            ++client.pingCount;
            client.send({id: obj.id, jsonrpc: '2.0', result: true}).then(() => client.waitForPing.advance());

            return;
        }

        client.messages.push(obj);
        client.waitForMessage.advance();
    });

    return new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
    }).then(() => client);
};

module.exports = cncClient;
