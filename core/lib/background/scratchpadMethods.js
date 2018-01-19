'use strict';
/* global Blob, URL */
const log = require('../../../lib/logger')({hostname: 'background', MODULE: 'core/background/scratchpadMethods'});
const RunnerScriptParent = require('./RunnerScriptParent');
const errorToObject = require('../../../lib/errorToObject');
const {SCRATCHPAD_RESULT_HTML, SCRATCHPAD_BREAKDOWN_HTML} = require('../scratchpad-content/urls');

let saveUrl;

module.exports = ({browserTabId, browserTabs, browserDownloads, rpc, scratchpadRPC}) => {
    let activeScript = null;
    let intervalTimer = 0;
    let resultBrowserTabId = 0;

    const setRunState = ({state, iterationsLeft}) => {
        rpc.call('setRunState', {state, iterationsLeft});
    };

    const stopInterval = () => {
        clearInterval(intervalTimer);
        intervalTimer = 0;
    };

    const cancelRun = async reason => {
        const script = activeScript;
        activeScript = null;

        if (script) {
            log.info({reason}, 'Canceling active script run (from scratchpad)');
            setRunState({state: 'stopping'});

            try {
                await script.stop({message: reason});
            }
            finally {
                setRunState({state: 'stopped'});
            }
        }
    };

    const doRun = async ({content, interval, iterations}) => {
        try {
            const iterationsLeft = iterations - 1;

            stopInterval();
            cancelRun('Canceled active scratchpad script');
            log.info('Starting script run from scratchpad');

            const script = new RunnerScriptParent();

            try {
                setRunState({state: 'compiling'});
                script.compileScript(content, 'scratchpad.js');
            }
            catch (err) {
                setRunState({state: 'compileFailed'});
                log.error({err}, 'Error while compiling script from scratchpad');
                await openTabWithResults({error: errorToObject(err), result: null, value: null});
                return;
            }

            activeScript = script;
            let result = null;

            try {
                setRunState({state: 'running'});
                result = await script.run(); // note: script.cancelRun() will reject this promise
                log.info('Script run complete');
            }
            catch (err) {
                log.info({err}, 'Error while running script from scratchpad');
                result = {error: errorToObject(err), result: null, value: null};
            }

            await openTabWithResults(result);

            const wasActiveScript = script === activeScript;
            activeScript = null;

            if (wasActiveScript) {
                setRunState({state: 'done'});
            }

            // NaN / null / -1 = no interval; 0 = start immediately after the last run
            if (
                wasActiveScript &&
                (interval === 0 || interval > 0)
                && iterationsLeft > 0
            ) {
                setRunState({iterationsLeft, state: 'waiting'});
                intervalTimer = setTimeout(() => doRun({
                    content,
                    interval,
                    iterations: iterationsLeft,
                }), interval);
            }
        }
        catch (err) {
            log.error({err}, 'Uncaught error in doRun()');
        }
    };

    const openTabWithResults = async result => {
        const myTab = await browserTabs.get(browserTabId);

        if (resultBrowserTabId) {
            try {
                await browserTabs.get(resultBrowserTabId);
            }
            catch (err) {
                resultBrowserTabId = 0; // tab has been closed by the user
            }
        }

        if (!resultBrowserTabId) {
            resultBrowserTabId = await scratchpadRPC.createTab({
                url: SCRATCHPAD_RESULT_HTML,
                windowId: myTab.windowId,
            });
        }

        const rpc = await scratchpadRPC.getRpc(resultBrowserTabId);
        await rpc.call('setResultJSONObject', result);
    };

    const executeScript = ({content, interval, iterations}) => {
        log.info({interval, iterations, size: content.length}, 'Starting script from scratchpad...');
        doRun({content, interval, iterations})
        .catch(err => log.error({err}, 'Uncaught error in RPC call executeScript()'));
    };

    const stopScript = () => {
        log.info('Stopping script scratchpad script...');
        stopInterval();
        cancelRun('User pressed stop button in the scratchpad');
        setRunState({state: 'stopped'});
    };

    const openResultBreakdown = async resultObject => {
        const myTab = await browserTabs.get(browserTabId);

        const breakdownBrowserTabId = await scratchpadRPC.createTab({
            url: SCRATCHPAD_BREAKDOWN_HTML,
            windowId: myTab.windowId,
        });

        const rpc = await scratchpadRPC.getRpc(breakdownBrowserTabId);
        await rpc.call('setResultJSONObject', resultObject);
    };

    const saveTextToFile = async ({content, mimeType = 'application/octet-stream', filename}) => {
        const blob = new Blob([content], {type: String(mimeType)});
        if (saveUrl) {
            URL.revokeObjectURL(saveUrl);
            saveUrl = null;
        }
        saveUrl = URL.createObjectURL(blob);

        await browserDownloads.download({
            filename: String(filename),
            saveAs: true,
            url: saveUrl,
        });
    };

    return new Map([
        ['executeScript', executeScript],
        ['stopScript', stopScript],
        ['openResultBreakdown', openResultBreakdown],
        ['saveTextToFile', saveTextToFile],
    ]);
};
