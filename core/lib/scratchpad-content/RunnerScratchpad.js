'use strict';

/* eslint-disable import/no-unassigned-import */
const ace = require('brace');
require('brace/mode/javascript');
require('brace/mode/json');
require('brace/theme/monokai');

const log = require('../../../lib/logger')({hostname: 'scratchpad-content', MODULE: 'scratchpad-content/RunnerScratchpad'});

let previousSaveUrl = null;

class RunnerScratchpad {
    static saveDialog(window, content, {fileName, mimeType} = {}) {
        const {document} = window;
        const {Blob, URL, MouseEvent} = window;

        const blob = new Blob([content], {type: mimeType || 'application/octet-stream'});

        log.info({size: blob.size}, 'Attempting to save file');

        if (previousSaveUrl) {
            URL.revokeObjectURL(previousSaveUrl);
            previousSaveUrl = null;
        }

        previousSaveUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = fileName;
        link.href = previousSaveUrl;
        link.dispatchEvent(new MouseEvent('click'));
    }

    constructor(container, optionsArg = {}) {
        if (!container) {
            throw Error('Argument 0 must be a DOM Element');
        }

        const options = Object.assign({
            enableUndo: true,
            mode: 'javascript',
        },
        optionsArg);

        this.mode = options.mode || 'javascript';
        this.enableUndo = options.enableUndo;
        this.container = container;
        this.editor = null;
        this._hiddenFileInput = null;

        if (this.mode === 'javascript') {
            this.mimeType = 'text/javascript';
            this.fileExtension = 'js';
        }
        else if (this.mode === 'json') {
            this.mimeType = 'application/json';
            this.fileExtension = 'json';
        }
        else {
            throw Error('Invalid mode "' + this.mode + '"');
        }
    }

    initialize() {
        const editor = ace.edit(this.container);
        this.editor = editor;
        editor.getSession().setMode('ace/mode/' + this.mode);
        editor.setTheme('ace/theme/monokai');
        editor.setPrintMarginColumn(140);

        if (!this.enableUndo) {
            editor.getSession().setUndoManager({
                execute: () => undefined,
                hasRedo: () => false,
                hasUndo: () => false,
                isClean: () => false, // might be used for the disabled state of save buttons
                markClean: () => undefined,
                redo: () => null,
                reset: () => undefined,
                undo: () => null,
            });
        }

        if (this.mode === 'javascript') {
            // TODO: implement async/await and implement an implicit async function wrapper around the script
            editor.getSession().setUseWorker(false); // disable syntax checks for now
        }
    }

    getValue() {
        return this.editor.getValue();
    }

    setValue(scriptContent) {
        return this.editor.setValue(scriptContent);
    }

    openDialog() {
        const document = this.container.ownerDocument;
        const window = document.defaultView;
        const {FileReader} = window;

        if (!this._hiddenFileInput) {
            const input = document.createElement('input');
            input.style.display = 'none';
            input.type = 'file';
            input.accept = this.mimeType;
            this.container.parentNode.insertBefore(input, this.container);

            input.addEventListener('change', e => {
                const {files} = e.target;

                if (!files.length) {
                    return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                    this.setValue(reader.result);
                };
                reader.readAsText(files[0]);
            });

            this._hiddenFileInput = input;
        }

        this._hiddenFileInput.click();
    }

    saveDialog({fileName} = {}) {
        RunnerScratchpad.saveDialog(this.container.ownerDocument.defaultView, this.getValue(), {
            fileName: fileName || 'Openrunner-scratchpad.' + this.fileExtension,
            mimeType: this.mimeType,
        });

    }
}


module.exports = RunnerScratchpad;
