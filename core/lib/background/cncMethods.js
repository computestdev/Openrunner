'use strict';
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'core/background/cncMethods'});
const RunnerScriptParent = require('./RunnerScriptParent');
const errorToObject = require('../../../lib/errorToObject');

module.exports = () => {
    const runScript = async ({scriptContent, stackFileName}) => {
        log.info({stackFileName}, `Starting script run`);

        const script = new RunnerScriptParent();
        try {
            log.info({stackFileName}, 'Compiling script');
            script.compileScript(scriptContent, stackFileName);

            log.info('Starting script run');
            return await script.run(); // {error, result, value}
        }
        catch (err) {
            log.info({err}, 'Error during script run');
            return {error: errorToObject(err), result: null, value: null};
        }
        finally {
            log.info('Script run complete');
        }
    };

    return new Map([
        ['runScript', runScript],
    ]);
};
