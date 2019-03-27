/* eslint-disable no-console */
/* global process */
'use strict';

const errorToObject = require('./errorToObject');

const DEFAULT_HOSTNAME = (() => {
    if (process.browser) {
        return '';
    }

    // eslint-disable-next-line global-require
    return require('o' + 's').hostname();
})();
const DEFAULT_PID = process.pid || 0;

// same format as bunyan
const logObject = (...args) => {
    const obj = {
        hostname: DEFAULT_HOSTNAME,
        pid: DEFAULT_PID,
    };

    for (const arg of args) {
        if (typeof arg === 'string') {
            Object.assign(obj, {msg: arg});
        }
        else {
            Object.assign(obj, arg);
        }
    }

    Object.assign(obj, {
        name: 'Openrunner',
        time: new Date().toISOString(),
        v: 0,
    });

    if (obj.err) {
        obj.err = errorToObject(obj.err);
    }

    return obj;
};

const logBrowser = (level, str) => {
    const bold = 'font-weight:bold';

    if (level >= 50) {
        console.error('%c%s', `${bold}`, str);
    }
    else if (level >= 40) {
        console.warn('%c%s', `${bold}`, str);
    }
    else if (level >= 30) {
        console.info('%s', str);
    }
    else {
        console.log('%c%s', 'color:#aaaaaa', str);
    }
};

const logNode = (level, str) => {
    if (level >= 50) {
        console.log('%s', str);
    }
    else if (level >= 40) {
        console.log('%s', str);
    }
    else if (level >= 30) {
        console.log('%s', str);
    }
    else {
        console.log('%s', str);
    }
};

const log = (...args) => {
    const obj = logObject(...args);
    const str = JSON.stringify(obj);

    if (process.browser) { // eslint-disable-line no-undef
        logBrowser(obj.level, str);
    }
    else {
        logNode(obj.level, str);
    }
};

module.exports = obj => {
    return {
        debug: log.bind(null, obj, {level: 20}),
        info:  log.bind(null, obj, {level: 30}),
        warn:  log.bind(null, obj, {level: 40}),
        error: log.bind(null, obj, {level: 50}),
    };
};
