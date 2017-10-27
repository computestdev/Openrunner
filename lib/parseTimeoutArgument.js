'use strict';

const parseTimeoutArgument = timeout => { // same as bluefox
    if (typeof timeout === 'string' && /^([\d.]+)s$/.test(timeout)) {
        return parseFloat(timeout) * 1000;
    }

    if (typeof timeout === 'number') {
        return timeout;
    }

    throw Error('Invalid timeout argument, expected a number or a duration string');
};

module.exports = parseTimeoutArgument;
