'use strict';
const {translateRpcErrorName} = require('../../../../lib/scriptErrors');
const parseTimeoutArgument = require('../../../../lib/parseTimeoutArgument');
const extendStack = require('../../../../lib/extendStack');
const maybeThrowUserScriptError = require('../maybeThrowUserScriptError');

/**
 * @param {ContentRPC} rpc
 * @return {Frame}
 */
module.exports = rpc => {
    class Frame {
        constructor(id) {
            this.id = id;
            Object.freeze(this);
        }

        async run(func, arg) {
            return extendStack(async () => {
                const code = func.toString();

                // An error thrown by whatever is in `code` is returned as `reject`, all other errors will be thrown by rpcCall()
                const {resolve, reject} = await rpc.call({name: 'tabs.frameRun', timeout: 0}, {
                    frameId: this.id,
                    code,
                    arg,
                })
                .catch(translateRpcErrorName);
                maybeThrowUserScriptError(reject);
                return resolve;
            });
        }

        async wait(func, arg) {
            return extendStack(async () => {
                const code = func.toString();

                const {resolve, reject} = await rpc.call({name: 'tabs.frameWait', timeout: 0}, {
                    frameId: this.id,
                    code,
                    arg,
                })
                .catch(translateRpcErrorName);
                maybeThrowUserScriptError(reject);
                return resolve;
            });
        }

        async waitForNewPage(func, arg, {timeout = '30s'} = {}) {
            return extendStack(async () => {
                const code = func.toString();
                const timeoutMs = parseTimeoutArgument(timeout);

                const {resolve, reject} = await rpc.call({name: 'tabs.frameWaitForNewPage', timeout: 0}, {
                    frameId: this.id,
                    code,
                    arg,
                    timeoutMs,
                })
                .catch(translateRpcErrorName);
                maybeThrowUserScriptError(reject);
                return resolve;
            });
        }
    }
    return Frame;
};
