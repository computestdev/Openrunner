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
            for (let i = 0; i < events.length; ++i) {
                const event = events[i];
                event.id = generateEventId();
                addEventId(event.children);
            }
        };

        addEventId(result.events);

        for (const transaction of result.transactions) {
            if (transaction.error) {
                if (transaction.error.stack) {
                    transaction.error.stack = resolveScriptContentEvalStack(transaction.error.stack);
                    transaction.error.stack = resolveScriptEnvEvalStack(transaction.error.stack);
                }
                transaction.error = scriptErrorToObject(transaction.error);

                if (scriptFileName) {
                    replaceMagicScriptNames(transaction.error, scriptFileName);
                }
            }
        }

        return result;
    }
}

Object.freeze(RunResultBackground.prototype);
Object.freeze(RunResultBackground);

module.exports = RunResultBackground;
