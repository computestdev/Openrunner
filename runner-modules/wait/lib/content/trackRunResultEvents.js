'use strict';
/* global performance:false */

const trackRunResultEvents = (runResult, bluefox) => {
    const executions = new Map(); // executionId => {expression, begin, end, lastCheckBegin}
    const {TimePoint, scriptResult} = runResult;

    bluefox.onExecuteBegin = ({expression, executionId, resultPromise}) => {
        const data = {
            expression,
            begin: new TimePoint(),
            end: null,
            lastCheckBegin: null,
            checks: 0,
            checksOverhead: 0,
            error: null,
        };
        executions.set(executionId, data);
        resultPromise.catch(err => {
            data.error = err;
        });
    };
    bluefox.onExecuteEnd = ({executionId}) => {
        const data = executions.get(executionId);
        if (data) {
            data.end = new TimePoint();
        }
    };
    bluefox.onCheckBegin = ({executionId}) => {
        const data = executions.get(executionId);
        if (data) { // onExecuteBegin may not have been called if executeOnce() is used
            data.lastCheckBegin = performance.now();
        }
    };
    bluefox.onCheckEnd = ({executionId}) => {
        const data = executions.get(executionId);
        if (data) {
            ++data.checks;
            data.checksOverhead += performance.now() - data.lastCheckBegin;
        }
    };

    const drain = () => {
        for (const execution of executions.values()) {
            const event = scriptResult.timePointEvent('command:wait', execution.begin, execution.end);
            const description = execution.expression.describe();
            event.shortTitle = 'Wait for DOM condition';
            event.longTitle = description;
            event.setMetaData('checkCount', execution.checks);
            event.setMetaData('checkOverhead', execution.checksOverhead);
            event.setMetaData('failureReason', execution.error ? execution.error.message : null);
        }

        executions.clear();
    };

    return drain;
};

module.exports = trackRunResultEvents;
