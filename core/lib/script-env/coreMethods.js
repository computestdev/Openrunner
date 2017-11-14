'use strict';
const log = require('../../../lib/logger')({hostname: 'script-env', MODULE: 'core/script-env/coreMethods'});

module.exports = script => {
    const stopScript = async ({reason}) => {
        await script.stop(reason);
    };

    const runScript = async ({scriptContent, stackFileName}) => {
        script.compileScript(scriptContent, stackFileName);
        const {scriptError, scriptValue} = await script.run();
        return {scriptError, scriptValue};
    };

    const importScripts = (...urls) => {
        log.debug({urls}, 'importScripts');
        for (const url of urls) {
            if (typeof url !== 'string' || !/^moz-extension:\/\//.test(url)) {
                throw Error(`importScripts(): Invalid url ${url}`);
            }
        }

        self.importScripts(...urls);
    };

    const reportCodeCoverage = () => {
        // eslint-disable-next-line camelcase, no-undef
        const coverageData = typeof __runner_coverage__ !== 'undefined' && __runner_coverage__;

        if (!coverageData) {
            throw Error('This Openrunner build has not been instrumented for code coverage');
        }

        return coverageData;
    };

    return new Map([
        ['core.stopScript', stopScript],
        ['core.runScript', runScript],
        ['core.importScripts', (...urls) => importScripts(...urls)],
        ['core.reportCodeCoverage', reportCodeCoverage],
    ]);
};
