'use strict';
const log = require('./logger')({MODULE: 'asyncTimeout'});

const asyncTimeout = (func, timeout, timeoutMessage = `Asynchronous function "${func.name}" timed out after ${timeout}ms`) =>
    async (...args) =>
        new Promise((resolve, reject) => {
            let timedOut = false;
            let timer = 0;

            timer = timeout && setTimeout(
                () => {
                    timer = 0;
                    timedOut = true;
                    reject(Error(timeoutMessage));
                },
                timeout
            );

            const start = Date.now();
            const promise = Promise.resolve().then(() => func(...args));

            promise.then(result => {
                if (timedOut) {
                    log.warn(
                        {func: func.name, timeout, delay: Date.now() - start},
                        'Asynchronous function resolved after its promise was rejected because of the given timeout'
                    );
                    return;
                }

                clearTimeout(timer);
                resolve(result);
            }, err => {
                if (timedOut) {
                    log.error(
                        {func: func.name, timeout, delay: Date.now() - start, err},
                        'Asynchronous function rejected after its promise was rejected because of the given timeout'
                    );
                    return;
                }
                clearTimeout(timer);
                reject(err);
            });
        });


module.exports = asyncTimeout;
