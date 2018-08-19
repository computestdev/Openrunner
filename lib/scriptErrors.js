'use strict';

// (all errors which are visible to the runner script made by the user under normal conditions)

/**
 * An argument passed to one of the api functions or setters is incompatible with the type expected by that function
 */
const ILLEGAL_ARGUMENT_ERROR = 'Openrunner:IllegalArgumentError';

/**
 * An api function has been called at an inappropriate time
 */
const ILLEGAL_STATE_ERROR = 'Openrunner:IllegalStateError';

/**
 * Unable to navigate to the specified URL using tab.navigate()
 */
const NAVIGATE_ERROR = 'Openrunner:NavigateError';

/**
 * And assertion made by the script has failed.
 */
const ASSERTION_ERROR = 'Openrunner:AssertionError';

/**
 * The script is waiting for a condition in the DOM (e.g. a specific DOM Element to be present) which has been
 * aborted because it took too long.
 */
const DOM_WAIT_TIMEOUT_ERROR = 'BluefoxTimeoutError';

/**
 * The script is waiting for a new page to be navigated too, which has been aborted because it took too long.
 */
const NEW_PAGE_WAIT_TIMEOUT_ERROR = 'Openrunner:NewPageWaitTimeoutError';


/**
 * An active transaction has been aborted because the script is stopping.
 */
const TRANSACTION_ABORTED_ERROR = 'Openrunner:TransactionAbortedError';

/**
 * An active content script (e.g. `tab.run()`)has been aborted because the page is navigating away,
 * the tab is closing, or the script is stopping.
 */

const CONTENT_SCRIPT_ABORTED_ERROR = 'Openrunner:ContentScriptAbortedError';

/**
 * The Openrunner script has been running longer than its configured timeout limit and has been aborted.
 * For example:
 * 'Openrunner-Script-Timeout: 10s'
 */
const SCRIPT_EXECUTION_TIMEOUT_ERROR = 'Openrunner:ScriptExecutionTimeoutError';

/**
 * The RPC call towards/from the content script has timeout out.
 *
 * Note: In most cases this error will be translated to a different one
 * @type {string}
 */
const CONTENT_RPC_TIMEOUT_ERROR = 'Openrunner:ContentRPCTimeoutError';

/**
 * The tabs.frame() call is waiting for the content of a frame (e.g. iframe) to become available, however this took too long.
 * This could happen for example if the frame src is set to "about:blank", or if the initial http request takes too long to complete.
 * @type {string}
 */
const FRAME_CONTENT_TIMEOUT_ERROR = 'Openrunner:FrameContentTimeoutError';

const createErrorShorthand = name => (message, cause = null) => {
    const err = new Error(message);
    err.name = name;
    err.cause = cause;
    return err;
};

const translateRpcErrorName = err => {
    const match = /RPCRequestError<(Openrunner:.*?)>/.exec(err && err.name);
    if (match) {
        err.name = match[1];
    }
    throw err;
};

module.exports = {
    ILLEGAL_ARGUMENT_ERROR,
    ILLEGAL_STATE_ERROR,
    NAVIGATE_ERROR,
    ASSERTION_ERROR,
    DOM_WAIT_TIMEOUT_ERROR,
    NEW_PAGE_WAIT_TIMEOUT_ERROR,
    TRANSACTION_ABORTED_ERROR,
    CONTENT_SCRIPT_ABORTED_ERROR,
    SCRIPT_EXECUTION_TIMEOUT_ERROR,
    CONTENT_RPC_TIMEOUT_ERROR,
    FRAME_CONTENT_TIMEOUT_ERROR,
    illegalArgumentError: createErrorShorthand(ILLEGAL_ARGUMENT_ERROR),
    illegalStateError: createErrorShorthand(ILLEGAL_STATE_ERROR),
    navigateError: createErrorShorthand(NAVIGATE_ERROR),
    assertionError: createErrorShorthand(ASSERTION_ERROR),
    newPageWaitTimeoutError: createErrorShorthand(NEW_PAGE_WAIT_TIMEOUT_ERROR),
    transactionAbortedError: createErrorShorthand(TRANSACTION_ABORTED_ERROR),
    contentScriptAbortedError: createErrorShorthand(CONTENT_SCRIPT_ABORTED_ERROR),
    scriptExecutionTimeoutError: createErrorShorthand(SCRIPT_EXECUTION_TIMEOUT_ERROR),
    frameContentTimeoutError: createErrorShorthand(FRAME_CONTENT_TIMEOUT_ERROR),
    translateRpcErrorName,
};
