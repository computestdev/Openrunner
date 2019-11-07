'use strict';
const Promise = require('bluebird');
const net = require('net');

const findFreeTCPPort = async () => {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.on('listening', resolve);
        server.listen(0);
    });
    try {
        return server.address().port;
    }
    finally {
        await Promise.fromCallback(cb => server.close(cb));
    }
    // note: there is no guarantee that the port is still free after this function returns,
    // but sadly this is the best that we can do for this use case.
};

module.exports = findFreeTCPPort;
