'use strict';
/* global window:false, document:false */
const RunnerScratchpad = require('./RunnerScratchpad');
const ContentRPC = require('../../../lib/contentRpc/ContentRPC');
const log = require('../../../lib/logger')({hostname: 'scratchpad-content', MODULE: 'scratchpad-content/scratchpad-result.html'});

let scratchpad;
const rpc = new ContentRPC({
    browserRuntime: browser.runtime,
    context: 'Scratchpad',
});
const historicTransactions = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        rpc.attach();

        scratchpad = new RunnerScratchpad(document.getElementById('editor'), {
            mode: 'json',
            enableUndo: false, // undo would cost a _lot_ of memory because each undo state would be a multi mega byte json document
        });
        scratchpad.initialize();

        document.addEventListener('click', e => {
            const classList = e.target.classList;

            if (classList.contains('saveButton')) {
                rpc.call('saveTextToFile', {
                    content: scratchpad.getValue(),
                    mimeType: 'application/json',
                    filename: 'result.json',
                })
                .catch(err => log.error({err}, 'Error while calling "saveTextToFile"'));
            }
            else if (classList.contains('breakdownButton')) {
                const resultObject = JSON.parse(scratchpad.getValue());
                rpc.callAndForget('openResultBreakdown', resultObject);
            }
            else if (classList.contains('saveHistoricToCSV')) {
                const content = historicTransactionsToCSV();

                rpc.callAndForget('saveTextToFile', {
                    content,
                    mimeType: 'text/csv',
                    filename: 'results.csv',
                });
            }
        });

        await rpc.call('initialized');
    }
    catch (err) {
        log.error({err}, 'Error during DOMContentLoaded');
    }
});

rpc.method('setResultJSONObject', object => {
    const resultJson = JSON.stringify(object, null, 4);
    scratchpad.setValue(resultJson);

    const transactions = new Map();
    for (const transaction of (object.result && object.result.transactions) || []) {
        transactions.set(transaction.id, transaction);
    }
    historicTransactions.push(transactions);
    updateHistoricTransactions();

    // display the error in a formatted table:
    const table = document.querySelector('#runError');
    const tBody = table.tBodies[0];

    while (tBody.lastChild) {
        tBody.removeChild(tBody.lastChild);
    }

    if (object.error) {
        let row = tBody.insertRow();
        row.insertCell().textContent = 'Name';
        row.insertCell().textContent = object.error.name;

        row = tBody.insertRow();
        row.insertCell().textContent = 'Message';
        row.insertCell().textContent = object.error.message;

        row = tBody.insertRow();
        row.insertCell().textContent = 'Stack';
        row.insertCell().textContent = object.error.stack;
    }
});

const transTitle = trans => String(trans.title || trans.id);

const transactionsToTable = (transactionsMaps, options = {}) => {
    const columnsMap = new Map();

    // figure out column order
    for (const transactionMap of transactionsMaps) {
        for (const {id, title} of transactionMap.values()) {
            // a Map ensures that we do not have any duplicates and that the transaction title defined in more
            // recent results overwrites the old title
            columnsMap.set(id, {id, title});
        }
    }
    const columns = [...columnsMap.values()];
    columns.sort((a, b) => transTitle(a).localeCompare(transTitle(b)));

    const headRow = [{value: '', moreInfo: ''}];

    if (options.excelTime) {
        headRow.push({value: 'Excel Time (UTC)', moreInfo: ''});
    }

    for (const trans of columns) {
        headRow.push({value: transTitle(trans), moreInfo: ''});
    }

    const bodyRows = [];

    for (const transactionMap of transactionsMaps) {
        const firstTransaction = transactionMap.values().next().value;

        if (!firstTransaction) {
            continue;
        }

        const row = [];
        bodyRows.push(row);

        const firstTransactionDateTime = new Date(firstTransaction.timing.begin.time);

        row.push({value: firstTransactionDateTime.toISOString(), moreInfo: ''});

        if (options.excelTime) {
            // convert to days then add the excel value for 1-1-1970
            const excelTime = firstTransactionDateTime.getTime() / 1000 / 60 / 60 / 24 + 25569;
            row.push({value: excelTime, moreInfo: ''});
            // yyyy-mm-dd hh:mm:ss.00
        }

        for (const {id: transactionId} of columns) {
            const transaction = transactionMap.get(transactionId);

            if (!transaction) {
                row.push({
                    value: '',
                    moreInfo: '',
                });
            }
            else if (transaction.error) {
                row.push({
                    value: transaction.error.message,
                    moreInfo: transaction.error.stack,
                });
            }
            else {
                row.push({
                    value: Math.round(transaction.timing.duration),
                    moreInfo:
                    new Date(transaction.timing.begin.time).toISOString() +
                    ' => ' +
                    new Date(transaction.timing.end.time).toISOString(),
                });
            }

        }
    }

    return {headRow, bodyRows};
};

const updateHistoricTransactions = () => {
    const table = document.querySelector('#historicTransactions');
    const {headRow, bodyRows} = transactionsToTable(historicTransactions);

    const tHead = table.tHead;
    const tBody = table.tBodies[0];

    while (tHead.lastChild) {
        tHead.lastChild.remove();
    }

    while (tBody.lastChild) {
        tBody.lastChild.remove();
    }

    const headRowNode = tHead.insertRow();

    for (const cell of headRow) {
        const cellNode = headRowNode.insertCell();
        cellNode.textContent = cell.value;
        cellNode.title = cell.moreInfo;
    }

    const buttonCellNode = headRowNode.cells[0];
    const saveHistoricToCSVButton = document.createElement('button');
    saveHistoricToCSVButton.classList.add('saveHistoricToCSV');
    saveHistoricToCSVButton.type = 'button';
    saveHistoricToCSVButton.textContent = 'Save\u00a0CSV';
    buttonCellNode.appendChild(saveHistoricToCSVButton);

    for (const row of bodyRows) {
        const rowNode = tBody.insertRow();

        for (const cell of row) {
            const cellNode = rowNode.insertCell();
            cellNode.textContent = cell.value;
            cellNode.title = cell.moreInfo;
        }
    }
};

const toUTF16LE = str => {
    // firefox does not yet support utf-16 for TextEncoder
    const arr = new Uint8Array(str.length * 2);

    for (let i = 0; i < str.length; ++i) {
        const char = str.charCodeAt(i);
        // (javascript strings already are utf-16)
        const dest = i * 2;
        arr[dest] = char & 0x00FF;
        arr[dest + 1] = (char & 0xFF00) >> 8;
    }

    return arr;
};

const historicTransactionsToCSV = () => {
    const escapeCell = text => (/["\n\r\t]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text);
    const {headRow, bodyRows} = transactionsToTable(historicTransactions, {excelTime: true});
    const rows = [headRow, ...bodyRows];

    // UTF-16 Little Endian; Excel will accept regardless of the system locale of the user
    const BOM = Uint8Array.from([0xFF, 0xFE]);
    const lines = rows.map(row => row.map(cell => escapeCell(cell.value)).join('\t') + '\n');

    const data = [
        BOM.buffer,
        ...lines.map(line => toUTF16LE(line).buffer), // Uint8Array
    ];
    return new window.Blob(data, {type: 'text/csv; charset=utf-16le'});
};
