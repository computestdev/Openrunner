'use strict';

const {transactionAbortedError} = require('../../../../lib/scriptErrors');
const TimePoint = require('../TimePoint');
const TimePeriod = require('../TimePeriod');
const Event = require('../Event');
const Transaction = require('../Transaction');
const RunResult = require('../RunResult');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'runResult/content/index'});

openRunnerRegisterRunnerModule('runResult', ({eventEmitter, rpc}) => {
    TimePoint.setCounterFunc(() => ({
        backgroundCounter: undefined,
        scriptCounter: undefined,
        contentCounter: performance.now(),
    }));

    const scriptResult = new RunResult();

    eventEmitter.on('tabs.contentUnload', () => {
        log.debug('Content unload, sending script result object');
        try {
            const transactionError = transactionAbortedError(
                'This transaction aborted because the page has navigated to a different location or the tab has been closed'
            );
            scriptResult.setPendingTransactionError(transactionError);

            rpc.callAndForget('runResult.scriptResult', scriptResult.toJSONObject());
        }
        catch (err) {
            log.error({err}, 'Error during tabs.contentUnload');
        }
    });

    return Object.freeze({
        TimePoint,
        TimePeriod,
        Event,
        Transaction,
        RunResult,
        scriptResult,
    });
});
