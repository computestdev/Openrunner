'use strict';

const eventIdGenerator = require('../eventIdGenerator');
const RunResultSuper = require('../RunResult');
const {
    resolveScriptEnvEvalStack,
    resolveScriptContentEvalStack,
    scriptErrorToObject,
    replaceMagicScriptNames,
} = require('../../../../lib/errorParsing');

class RunResultBackground extends RunResultSuper {
    constructor() {
        super();
    }

    toJSONObject({scriptFileName} = {}) {
        const result = super.toJSONObject();

        const generateEventId = eventIdGenerator(Date.now());
        const addEventId = events => {
            for (const event of events) {
                event.id = generateEventId();
                addEventId(event.children);
            }
        };

        const translateError = error => { // (error is a pojo here)
            if (!error) {
                return error;
            }

            let stack = error.stack;
            if (stack) {
                stack = resolveScriptContentEvalStack(stack);
                stack = resolveScriptEnvEvalStack(stack);
            }

            const newError = scriptErrorToObject(Object.assign({}, error, {stack}));

            if (scriptFileName) {
                replaceMagicScriptNames(newError, scriptFileName);
            }

            newError.cause = translateError(newError.cause);
            return newError;
        };

        addEventId(result.events);

        for (const transaction of result.transactions) {
            transaction.error = translateError(transaction.error);
        }

        return result;
    }
}

Object.freeze(RunResultBackground.prototype);
Object.freeze(RunResultBackground);

module.exports = RunResultBackground;
