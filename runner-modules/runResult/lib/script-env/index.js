'use strict';

const {transactionAbortedError} = require('../../../../lib/scriptErrors');
const TimePoint = require('../TimePoint');
const TimePeriod = require('../TimePeriod');
const Event = require('../Event');
const Transaction = require('../Transaction');
const RunResult = require('../RunResult');
const log = require('../../../../lib/logger')({hostname: 'script-env', MODULE: 'runResult/script-env/index'});

openRunnerRegisterRunnerModule('runResult', async ({script}) => {
    TimePoint.setCounterFunc(() => ({
        backgroundCounter: undefined,
        scriptCounter: performance.now(),
        contentCounter: undefined,
    }));

    const scriptResult = new RunResult();

    const handleRunEnd = async reason => {
        log.debug('Script run has ended, sending the run result for the script-env');
        const transactionError = transactionAbortedError(
            'This transaction aborted because the script run has ended: ' + (reason && reason.message)
        );
        scriptResult.setPendingTransactionError(transactionError);
        await script.rpcCall('runResult.scriptResult', scriptResult.toJSONObject());
    };

    script.on('core.runEnd', (wait, reason) => wait(handleRunEnd(reason)));

    return Object.freeze({
        TimePoint,
        TimePeriod,
        Event,
        Transaction,
        RunResult,
        scriptResult,
    });
});
