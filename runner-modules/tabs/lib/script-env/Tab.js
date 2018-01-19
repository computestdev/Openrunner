'use strict';
const {navigateError, illegalArgumentError, translateRpcErrorName} = require('../../../../lib/scriptErrors');
const parseTimeoutArgument = require('../../../../lib/parseTimeoutArgument');
const extendStack = require('../../../../lib/extendStack');

const LEFT_QUOTE = '\u201c';
const RIGHT_QUOTE = '\u201d';
const ALLOWED_URL_REGEXP = /^https?:\/\//;

const maybeThrowScriptEnvError = (reject) => {
    if (reject) { // error thrown by the user script
        const err = new Error(reject.message);
        err.data = reject.data;
        err.name = reject.name;
        err.stack = reject.stack;
        throw err;
    }
};

module.exports = script => {
    class Tab {
        constructor(id) {
            this.id = id;
            Object.freeze(this);
        }

        async navigate(url, {timeout = 30000} = {}) {
            const timeoutMs = parseTimeoutArgument(timeout);
            if (typeof url !== 'string' || !ALLOWED_URL_REGEXP.test(url)) {
                throw illegalArgumentError('tabs.navigate(): `url` argument must be an absolute HTTP URL');
            }

            return extendStack(async () => {
                try {
                    await script.rpcCall({timeout: timeoutMs, name: 'tabs.navigate'}, {id: this.id, url})
                    .catch(translateRpcErrorName);
                }
                catch (err) {
                    if (err.name === 'RPCRequestError' && err.code === -32000) {
                        throw navigateError(`Navigating to ${LEFT_QUOTE}${url}${RIGHT_QUOTE} timed out after ${timeoutMs / 1000} seconds.`);
                    }

                    throw err;
                }
            });
        }

        async run(func, arg) {
            return extendStack(async () => {
                const code = func.toString();

                // An error thrown by whatever is in `code` is returned as `reject`, all other errors will be thrown by rpcCall()
                const {resolve, reject} = await script.rpcCall({name: 'tabs.run', timeout: 0}, {
                    id: this.id,
                    code,
                    arg,
                })
                .catch(translateRpcErrorName);
                maybeThrowScriptEnvError(reject);
                return resolve;
            });
        }

        async wait(func, arg) {
            return extendStack(async () => {
                const code = func.toString();

                const {resolve, reject} = await script.rpcCall({name: 'tabs.wait', timeout: 0}, {
                    id: this.id,
                    code,
                    arg,
                })
                .catch(translateRpcErrorName);
                maybeThrowScriptEnvError(reject);
                return resolve;
            });
        }

        async waitForNewPage(func, arg, {timeout = '30s'} = {}) {
            return extendStack(async () => {
                const code = func.toString();
                const timeoutMs = parseTimeoutArgument(timeout);

                const {resolve, reject} = await script.rpcCall({name: 'tabs.waitForNewPage', timeout: 0}, {
                    id: this.id,
                    code,
                    arg,
                    timeoutMs,
                })
                .catch(translateRpcErrorName);
                maybeThrowScriptEnvError(reject);
                return resolve;
            });
        }
    }
    return Tab;
};
