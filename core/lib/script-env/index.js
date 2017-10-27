'use strict';
const log = require('../../../lib/logger')({hostname: 'script-env', MODULE: 'core/script-env/index'});
const RunnerScript = require('./RunnerScript');
const {isValidModuleName} = require('../../../lib/ModuleRegister');

log.info('Initializing...');

try {
    if (self.openRunnerRegisterRunnerModule) {
        throw Error('This script environment has already been initialized!');
    }

    self.openRunnerRegisterRunnerModule = async (moduleName, func) => {
        try {
            if (!isValidModuleName(moduleName)) {
                throw Error('openRunnerRegisterRunnerModule(); Invalid argument `moduleName`');
            }
            if (typeof func !== 'function') {
                throw Error('openRunnerRegisterRunnerModule(): Invalid argument `func`');
            }

            const initModule = async () => {
                return await func({script});
            };
            const promise = initModule();
            script.registerModule(moduleName, promise);
        }
        catch (err) {
            log.error({err}, 'Error during openRunnerRegisterRunnerModule()');
            throw err;
        }
    };

    // prevent the script from creating global variables, or modifying javascript built-ins
    // this is to ensure that scripts are forward-compatible
    ([
        self,
        self.Array,
        self.ArrayBuffer,
        self.Boolean,
        self.DataView,
        self.Date,
        self.Error,
        self.EvalError,
        self.Float32Array,
        self.Float64Array,
        self.Function,
        self.Int8Array,
        self.Int16Array,
        self.Int32Array,
        self.JSON,
        self.Map,
        self.Math,
        self.Number,
        self.Object,
        self.Promise,
        self.Proxy,
        self.RangeError,
        self.ReferenceError,
        self.Reflect,
        self.RegExp,
        self.Set,
        self.SharedArrayBuffer,
        self.String,
        self.Symbol,
        self.SyntaxError,
        self.TypeError,
        self.Uint8Array,
        self.Uint8ClampedArray,
        self.Uint16Array,
        self.Uint32Array,
        self.URIError,
        self.WeakMap,
        self.WeakSet,
    ]).forEach(obj => {
        if (obj) {
            Object.freeze(obj);
        }
        // freeze should not be used for prototypes: ({}).constructor=123 would fail
        if (obj && obj.prototype) {
            Object.seal(obj.prototype);
        }
    });

    const script = new RunnerScript();
    script.attach(self);

}
catch (err) {
    log.error({err}, 'Error while initializing script-env');
}
