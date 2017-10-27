'use strict';

const errorStackParser = require('error-stack-parser');

const errorToObject = require('./errorToObject');

const MAGIC_SCRIPT_STACK_FILE_NAME = '$PERFORM-RUNNER-SCRIPT-FILE$';
const MAGIC_SCRIPT_STACK_FILE_NAME_REGEXP = /\$PERFORM-RUNNER-SCRIPT-FILE\$/g;
const MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME = '$PERFORM-RUNNER-CONTENT-SCRIPT-FILE$';
const MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME_REGEXP = /\$PERFORM-RUNNER-CONTENT-SCRIPT-FILE\$/g;

const stackToFrames = error => {
    if (!error) {
        return null;
    }

    if (!error.stack) {
        return [];
    }

    return errorStackParser.parse(error).map(frame => Object({
        columnNumber: frame.columnNumber,
        fileName: frame.fileName || null,
        functionName: frame.functionName || null,
        lineNumber: frame.lineNumber,
        runnerScriptContext: runnerScriptFrameContext(frame),
    }));
};

/**
 * Returns where in the runner script this stack frame originated. `null` is returned if this frame did _not_
 * originate in user created code.
 * @param {Object} frame
 * @return {?string} 'main' or 'content'
 */
const runnerScriptFrameContext = frame => {
    if (frame.fileName === MAGIC_SCRIPT_STACK_FILE_NAME) {
        // filter out functions inserted by babel. these are all placed in a long line on line 1
        if (frame.lineNumber === 1) {
            return null;
        }

        return 'main';
    }

    if (frame.fileName === MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME) {
        return 'content';
    }

    return null;
};

const replaceMagicScriptNames = (errorObject, scriptFileName) => {
    if (!errorObject) {
        return;
    }

    const contentScriptFileName = scriptFileName + '#content';

    if (errorObject.fileName === MAGIC_SCRIPT_STACK_FILE_NAME) {
        errorObject.fileName = scriptFileName;
    }
    else if (errorObject.fileName === MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME) {
        errorObject.fileName = contentScriptFileName;
    }

    if (errorObject.stack) {
        errorObject.stack = errorObject.stack.replace(MAGIC_SCRIPT_STACK_FILE_NAME_REGEXP, scriptFileName);
        errorObject.stack = errorObject.stack.replace(MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME_REGEXP, contentScriptFileName);
    }

    if (errorObject.shortStack) {
        errorObject.shortStack = errorObject.shortStack.replace(MAGIC_SCRIPT_STACK_FILE_NAME_REGEXP, scriptFileName);
        errorObject.shortStack = errorObject.shortStack.replace(MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME_REGEXP, contentScriptFileName);
    }

    for (const frame of errorObject.stackFrames || []) {
        if (frame.fileName === MAGIC_SCRIPT_STACK_FILE_NAME) {
            frame.fileName = scriptFileName;
        }
        else if (frame.fileName === MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME) {
            frame.fileName = contentScriptFileName;
        }
    }
};

const framesToString = frames => frames.map(
    f => `${f.functionName || ''}@${f.fileName}:${f.lineNumber}:${f.columnNumber}`
).join('\n') + '\n';

const scriptErrorToObject = error => {
    if (!error) {
        return null;
    }

    const object = errorToObject(error);
    const stackFrames = stackToFrames(error);
    const shortStackFrames = stackFrames.filter(frame => frame.runnerScriptContext);

    object.stackFrames = stackFrames;
    object.shortStack = shortStackFrames.length ? framesToString(shortStackFrames) : null;

    const firstFrame = stackFrames[0];
    const firstShortFrame = shortStackFrames[0];

    object.fileName = undefined;
    object.lineNumber = undefined;
    object.columnNumber = undefined;
    object.functionName = undefined;

    if (firstShortFrame) {
        object.fileName = firstShortFrame.fileName;
        object.lineNumber = firstShortFrame.lineNumber;
        object.columnNumber = firstShortFrame.columnNumber;
        object.functionName = firstShortFrame.functionName;
    }
    else if (firstFrame) {
        object.functionName = firstFrame.functionName;
    }

    return object;
};

const resolveScriptEnvEvalStack = stack => {
    return stack.replace(/@moz-extension:\S+build\/script-env\.js\sline\s\d+\s+>\seval/g, `@${MAGIC_SCRIPT_STACK_FILE_NAME}`);
};

const resolveScriptContentEvalStack = stack => {
    return stack.replace(
        /@(?:moz-extension|file):\S+build\/tabs-content\.js\sline\s\d+\s+>\seval/g,
        `@${MAGIC_CONTENT_SCRIPT_STACK_FILE_NAME}`
    );
};

module.exports = {
    MAGIC_SCRIPT_STACK_FILE_NAME,
    stackToFrames,
    runnerScriptFrameContext,
    replaceMagicScriptNames,
    framesToString,
    scriptErrorToObject,
    resolveScriptEnvEvalStack,
    resolveScriptContentEvalStack,
};
