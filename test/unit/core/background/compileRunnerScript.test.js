'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, throws}} = require('chai');

const compileRunnerScript = require('../../../../core/lib/background/compileRunnerScript');

describe('compileRunnerScript', () => {
    it('Should parse all useful metadata literals (defaults)', () => {
        const scriptContent =
            '"Openrunner-Script:  v1";\n' +
            '"Openrunner-Script-Unknown-Key: asdf";\n' +
            'await include("stuff");\n' +
            'alert("hello!");';
        const result = compileRunnerScript(scriptContent);
        deq(result, {
            scriptCompiledContent: scriptContent,
            scriptApiVersion: 'v1',
            runTimeoutMs: 60000,
        });
    });

    it('Should parse all useful metadata literals (timeout as seconds)', () => {
        const scriptContent =
            '"Openrunner-Script: v1";\n' +
            '\'Openrunner-Script-Timeout: 300s\';\n' +
            'await include("stuff");\n' +
            'alert("hello!");';
        const result = compileRunnerScript(scriptContent);
        deq(result, {
            scriptCompiledContent: scriptContent,
            scriptApiVersion: 'v1',
            runTimeoutMs: 300000,
        });
    });

    it('Should parse all useful metadata literals (timeout as milliseconds)', () => {
        const scriptContent =
            '"Openrunner-Script: v1";\n' +
            '\'Openrunner-Script-Timeout: 300\';\n' +
            'await include("stuff");\n' +
            'alert("hello!");';
        const result = compileRunnerScript(scriptContent);
        deq(result, {
            scriptCompiledContent: scriptContent,
            scriptApiVersion: 'v1',
            runTimeoutMs: 300,
        });
    });

    it('Should throw for an invalid API version', () => {
        throws(() => compileRunnerScript('"Openrunner-Script: v233527";\nalert(123);'), /API.*version.*not.*supported.*v233527.*v1/i);
        throws(() => compileRunnerScript('alert(123);'), /Openrunner-Script.*literal.*missing/i);
    });

    it('Should throw for invalid script timeout value', () => {
        const scriptContent =
            '"Openrunner-Script: v1";\n' +
            '\'Openrunner-Script-Timeout: foo\';\n' +
            'await include("stuff");\n' +
            'alert("hello!");';
        throws(() => compileRunnerScript(scriptContent, /invalid.*syntax.*timeout/i));
    });
});
