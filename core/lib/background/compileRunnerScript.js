'use strict';
const getRunnerScriptMetadata = require('../../../lib/getRunnerScriptMetadata');

const compileRunnerScript = (scriptContent) => {
    const {scriptApiVersion, runTimeoutMs} = getRunnerScriptMetadata(scriptContent);

    return {
        scriptCompiledContent: scriptContent,
        scriptApiVersion,
        runTimeoutMs,
    };
};

module.exports = compileRunnerScript;

