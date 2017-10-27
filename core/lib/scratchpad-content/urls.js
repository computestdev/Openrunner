'use strict';
const SCRATCHPAD_HTML = browser.extension.getURL('/core/lib/scratchpad-content/scratchpad.html');
const SCRATCHPAD_RESULT_HTML = browser.extension.getURL('/core/lib/scratchpad-content/scratchpad-result.html');
const SCRATCHPAD_BREAKDOWN_HTML = browser.extension.getURL('/core/lib/scratchpad-content/scratchpad-breakdown.html');

module.exports = {SCRATCHPAD_HTML, SCRATCHPAD_RESULT_HTML, SCRATCHPAD_BREAKDOWN_HTML};
