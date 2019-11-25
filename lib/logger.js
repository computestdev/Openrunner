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
const listeners = new Set();

// same format as bunyan/pino
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

const defaultHandler = (obj) => {
    const bold = 'font-weight:bold';
    const {level} = obj;
    const str = JSON.stringify(obj);

    if (process.browser) {
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
    }
    else {
        console.log('%s', str);
    }
};

let configuredHandler = defaultHandler;

const log = (...args) => {
    let handler = configuredHandler;
    /* global window */
    if (
        configuredHandler === defaultHandler &&
        typeof window === 'object' &&
        typeof window.openRunnerRegisterRunnerModule === 'function' &&
        window.openRunnerRegisterRunnerModule.defaultLogHandler
    ) {
        handler = window.openRunnerRegisterRunnerModule.defaultLogHandler;
    }

    const obj = logObject(...args);

    try {
        handler(obj);
    }
    catch (err) {
        console.error('Error during log handler', err);

        try {
            // try to log an error of which we are sure there are not any special values which the handler
            // might choke on
            handler(logObject({
                level: 50,
                message: 'Error during log handler',
                originalMsg: String(obj.msg),
            }));
        }
        catch (err2) {
            console.error('Error during log handler for fallback message', err2);
        }
    }

    for (const listener of listeners) {
        try {
            listener(obj);
        }
        catch (err) {
            console.error('Error during log listener', err);
        }
    }
};

const bindLogger = obj => {
    return {
        debug: log.bind(null, obj, {level: 20}),
        info:  log.bind(null, obj, {level: 30}),
        warn:  log.bind(null, obj, {level: 40}),
        error: log.bind(null, obj, {level: 50}),
    };
};
bindLogger.logRaw = log;
bindLogger.defaultHandler = defaultHandler;
bindLogger.setHandler = newHandler => {
    configuredHandler = newHandler;
};
bindLogger.addLogListener = func => { listeners.add(func); };
bindLogger.removeLogListener = func => { listeners.delete(func); };
Object.freeze(bindLogger);
module.exports = bindLogger;
