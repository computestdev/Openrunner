'use strict';
/* global crypto:false */

if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') {
    // assume browser
    const cryptoFillRandomBytes = uint8Array => crypto.getRandomValues(uint8Array);
    module.exports = cryptoFillRandomBytes;
}
else {
    // assume node.js
    // eslint-disable-next-line global-require
    const crypto = require('cryp' + 'to'); // string concat to ignore "crypto" for browserify
    const cryptoFillRandomBytes = uint8Array => crypto.randomFillSync(uint8Array);
    module.exports = cryptoFillRandomBytes;
}
