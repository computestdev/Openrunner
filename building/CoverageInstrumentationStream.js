'use strict';
const {Transform} = require('stream');
const {createInstrumenter} = require('istanbul-lib-instrument');

const instrumenter = createInstrumenter({
    coverageVariable: '__runner_coverage__',
    preserveComments: true,
    compact: false,
    esModules: false,
    autoWrap: false,
    produceSourceMap: false,
    sourceMapUrlCallback: null,
    debug: false,
});

const scriptContent = Symbol('scriptContent');
const scriptFileName = Symbol('scriptFileName');

class CoverageInstrumentationStream extends Transform {
    constructor(options, fileName) {
        super(options);
        this[scriptContent] = '';
        this[scriptFileName] = fileName;
    }

    _transform(data, encoding, callback) {
        this[scriptContent] += data;
        callback(null);
    }

    _flush(callback) {
        let instrumented = instrumenter.instrumentSync(this[scriptContent], this[scriptFileName]);

        // Hack for CSP Compatibility
        instrumented = instrumented.replace(/global\s*=\s*new\s+Function\('return this'\)\(\),/g, 'global = self,');
        callback(null, instrumented);
    }
}

module.exports = CoverageInstrumentationStream;
