'use strict';
/* global document:false */
const RunnerScratchpad = require('./RunnerScratchpad');
const ContentRPC = require('../../../lib/ContentRPC');
const log = require('../../../lib/logger')({hostname: 'scratchpad-content', MODULE: 'scratchpad-content/scratchpad.html'});

const rpc = new ContentRPC({
    browserRuntime: browser.runtime,
    context: 'Scratchpad',
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        rpc.attach();
        const scratchpad = new RunnerScratchpad(document.getElementById('editor'));
        scratchpad.initialize();

        document.addEventListener('click', e => {
            try {
                const classList = e.target.classList;

                if (classList.contains('executeScriptButton')) {
                    const content = scratchpad.getValue();
                    const interval = document.querySelector('.executeScriptInterval').valueAsNumber * 1000;
                    const iterations = document.querySelector('.executeScriptIterations').valueAsNumber || 1;

                    rpc.call('executeScript', {content, interval, iterations})
                    .catch(err => log.error({err}, 'Error while calling "executeScript"'));
                }
                else if (classList.contains('stopScriptButton')) {
                    rpc.call('stopScript')
                    .catch(err => log.error({err}, 'Error while calling "stopScript"'));
                }
                else if (classList.contains('openButton')) {
                    scratchpad.openDialog();
                }
                else if (classList.contains('saveButton')) {
                    rpc.call('saveTextToFile', {
                        content: scratchpad.getValue(),
                        mimeType: 'text/javascript',
                        filename: 'scratchpad.js',
                    })
                    .catch(err => log.error({err}, 'Error while calling "saveTextToFile"'));
                }
            }
            catch (err) {
                log.error({err}, 'Error while handling button click');
            }
        });

        await rpc.call('initialized');
    }
    catch (err) {
        log.error({err}, 'Error during DOMContentLoaded');
    }
});

rpc.method('setRunState', ({state, iterationsLeft}) => {
    let text = state;
    if (state === 'waiting') {
        text += ' (' + iterationsLeft + 'x)';
    }

    for (const element of document.querySelectorAll('.executeScriptState')) {
        element.textContent = text;
    }
});
