'use strict';

const errorToObject = require('./errorToObject');

// same format as bunyan
const logObject = (...args) => {
    const obj = {
        hostname: '',
        pid: 0,
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
    if (level >= 50) {
        console.error('%c%s', 'color: #DD0000; font-weight: bold;', str);
    }
    else if (level >= 40) {
        console.warn('%c%s', 'color: #A9A900; font-weight: bold;', str);
    }
    else if (level >= 30) {
        console.info('%c%s', 'color: #0000DD;', str);
    }
    else {
        console.log('%c%s', 'color: black;', str);
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
