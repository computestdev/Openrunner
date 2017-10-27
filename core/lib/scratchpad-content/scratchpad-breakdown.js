'use strict';
/* global window: false, document:false */
const React = require('react');
const ReactDOM = require('react-dom');

const log = require('../../../lib/logger')({hostname: 'scratchpad-content', MODULE: 'scratchpad-content/scratchpad-breakdown.html'});
const ContentRPC = require('../../../lib/ContentRPC');

const {PerformrRunnerResultGraph} = window;
const rpc = new ContentRPC({
    browserRuntime: browser.runtime,
    context: 'Scratchpad',
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        rpc.attach();

        document.querySelector('#upload').addEventListener('change', e => {
            try {
                const {files} = e.target;

                if (!files.length) {
                    return;
                }

                const reader = new window.FileReader();
                reader.onload = () => {
                    ReactDOM.unmountComponentAtNode(document.querySelector('#graph-container'));
                    try {
                        const result = JSON.parse(reader.result);
                        render(result);
                    }
                    catch (err) {
                        log.error({err}, 'Error while handling upload');
                        document.querySelector('#render-error').textContent = err.message;
                    }
                };
                reader.readAsText(files[0]);
                document.querySelector('#render-error').textContent = '';
            }
            catch (err) {
                log.error({err}, 'Error while handling upload');
                document.querySelector('#render-error').textContent = err.message;
            }
        });

        await rpc.call('initialized');
    }
    catch (err) {
        log.error({err}, 'Error during DOMContentLoaded');
    }
});

rpc.method('setResultJSONObject', resultObject => render(resultObject));

const render = resultObject => {
    const parsedResultObject = PerformrRunnerResultGraph.parseResultObject(resultObject.result);
    const component = React.createElement(PerformrRunnerResultGraph.default, {resultObject: parsedResultObject});

    const container = document.querySelector('#graph-container');
    ReactDOM.unmountComponentAtNode(container);
    ReactDOM.render(component, container);
};
