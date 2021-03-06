'use strict';
const getURL = url => browser.extension.getURL(url);

const SCRIPT_ENV = getURL('/build/script-env.js');
const SCRIPT_ENV_CONTENT = getURL('/build/script-env-content.js');
const BLANK_HTML = getURL('/core/lib/content/blank.html');
const SCRATCHPAD_HTML = getURL('/core/lib/scratchpad-content/scratchpad.html');
const SCRATCHPAD_RESULT_HTML = getURL('/core/lib/scratchpad-content/scratchpad-result.html');
const SCRATCHPAD_BREAKDOWN_HTML = getURL('/core/lib/scratchpad-content/scratchpad-breakdown.html');

module.exports = Object.freeze({
    SCRIPT_ENV,
    SCRIPT_ENV_CONTENT,
    BLANK_HTML,
    SCRATCHPAD_HTML,
    SCRATCHPAD_RESULT_HTML,
    SCRATCHPAD_BREAKDOWN_HTML,
});
