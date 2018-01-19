'use strict';
const {illegalArgumentError} = require('../../../../lib/scriptErrors');

const DOM_KEY_LOCATION_STANDARD = 0;
const DOM_KEY_LOCATION_LEFT = 1;
const DOM_KEY_LOCATION_RIGHT = 2;
// const DOM_KEY_LOCATION_NUMPAD = 3;

// This list maps KeyboardEvent.key, .code and .keyCode to each other
// This list is used to simulate keyboard events and represents an "example" keyboard layout
// this list is not complete, add more entries as needed

// spec: https://www.w3.org/TR/uievents-key/

class KeyEntry {
    // eslint-disable-next-line max-params
    constructor(key, characterValue, code, keyCode, shift, {identifier = key} = {}) {
        /**
         * A unique identifier to refer this KeyEntry by. This is only used in the keyboard API of Openrunner.
         * In the most common case, this is the same as `this.key`
         * @type {string}
         */
        this.identifier = identifier;
        /**
         * For keys that produce a character value
         * @type {string}
         */
        this.characterValue = characterValue;
        /**
         * See KeyboardEvent#key
         * @type {string}
         */
        this.key = key;
        /**
         * See KeyboardEvent#code
         * @type {string}
         */
        this.code = code;
        /**
         * See KeyboardEvent#keyCode (legacy)
         * @type {number}
         */
        this.keyCode = keyCode;
        /**
         * Must shift be down for this key?
         * @type {boolean}
         */
        this.shift = shift;
        /**
         * See KeyboardEvent.location
         * @type {number}
         */
        this.location = DOM_KEY_LOCATION_STANDARD;
        if (this.code === 'AltLeft' || this.code === 'ControlLeft' || this.code === 'OSLeft' || this.code === 'ShiftLeft') {
            this.location = DOM_KEY_LOCATION_LEFT;
        }
        else if (this.code === 'AltRight' || this.code === 'ControlRight' || this.code === 'OSRight' || this.code === 'ShiftRight') {
            this.location = DOM_KEY_LOCATION_RIGHT;
        }

        this.isCtrlKey = this.key === 'Control';
        this.isShiftKey = this.key === 'Shift';
        this.isAltKey = this.key === 'Alt';
        this.isMetaKey = this.key === 'Meta';
        this.firesKeyPress = !this.isCtrlKey && !this.isShiftKey && !this.isAltKey && !this.isMetaKey;
        Object.freeze(this);
    }

    getEventInit(type) {
        const charCode = this.characterValue.charCodeAt(0);
        const useCharCode = type === 'keypress' && this.characterValue.length > 0 && charCode > 0x1F;

        return {
            bubbles: true,
            cancelable: true,
            composed: true,
            key: this.key,
            code: this.code,
            keyCode: !useCharCode ? this.keyCode : 0,
            charCode: useCharCode ? charCode : 0,
            location: this.location,
            repeat: false,
            ctrlKey: this.isCtrlKey && type !== 'keyup',
            shiftKey: this.isShiftKey ? type !== 'keyup' : this.shift,
            altKey: this.isAltKey && type !== 'keyup',
            metaKey: this.isMetaKey && type !== 'keyup',
        };
    }
}

const entries = Object.freeze([
    new KeyEntry(' ', ' ', 'Space', 32, false),
    new KeyEntry('!', '!', 'Digit1', 49, true),
    new KeyEntry('"', '"', 'Quote', 222, true),
    new KeyEntry('#', '#', 'Digit3', 51, true),
    new KeyEntry('$', '$', 'Digit4', 52, true),
    new KeyEntry('%', '%', 'Digit5', 53, true),
    new KeyEntry('&', '&', 'Digit7', 55, true),
    new KeyEntry('\'', '\'', 'Quote', 222, false),
    new KeyEntry('(', '(', 'Digit9', 57, true),
    new KeyEntry(')', ')', 'Digit0', 48, true),
    new KeyEntry('*', '*', 'Digit8', 56, true),
    new KeyEntry('+', '+', 'Equal', 61, true),
    new KeyEntry(',', ',', 'Comma', 188, false),
    new KeyEntry('-', '-', 'Minus', 173, false),
    new KeyEntry('.', '.', 'Period', 190, false),
    new KeyEntry('/', '/', 'Slash', 191, false),
    new KeyEntry('0', '0', 'Digit0', 48, false),
    new KeyEntry('1', '1', 'Digit1', 49, false),
    new KeyEntry('2', '2', 'Digit2', 50, false),
    new KeyEntry('3', '3', 'Digit3', 51, false),
    new KeyEntry('4', '4', 'Digit4', 52, false),
    new KeyEntry('5', '5', 'Digit5', 53, false),
    new KeyEntry('6', '6', 'Digit6', 54, false),
    new KeyEntry('7', '7', 'Digit7', 55, false),
    new KeyEntry('8', '8', 'Digit8', 56, false),
    new KeyEntry('9', '9', 'Digit9', 57, false),
    new KeyEntry(':', ':', 'Semicolon', 59, true),
    new KeyEntry(';', ';', 'Semicolon', 59, false),
    new KeyEntry('<', '<', 'Comma', 188, true),
    new KeyEntry('=', '=', 'Equal', 61, false),
    new KeyEntry('>', '>', 'Period', 190, true),
    new KeyEntry('?', '?', 'Slash', 191, true),
    new KeyEntry('@', '@', 'Digit2', 50, true),
    new KeyEntry('A', 'A', 'KeyA', 65, true),
    new KeyEntry('B', 'B', 'KeyB', 66, true),
    new KeyEntry('C', 'C', 'KeyC', 67, true),
    new KeyEntry('D', 'D', 'KeyD', 68, true),
    new KeyEntry('E', 'E', 'KeyE', 69, true),
    new KeyEntry('F', 'F', 'KeyF', 70, true),
    new KeyEntry('G', 'G', 'KeyG', 71, true),
    new KeyEntry('H', 'H', 'KeyH', 72, true),
    new KeyEntry('I', 'I', 'KeyI', 73, true),
    new KeyEntry('J', 'J', 'KeyJ', 74, true),
    new KeyEntry('K', 'K', 'KeyK', 75, true),
    new KeyEntry('L', 'L', 'KeyL', 76, true),
    new KeyEntry('M', 'M', 'KeyM', 77, true),
    new KeyEntry('N', 'N', 'KeyN', 78, true),
    new KeyEntry('O', 'O', 'KeyO', 79, true),
    new KeyEntry('P', 'P', 'KeyP', 80, true),
    new KeyEntry('Q', 'Q', 'KeyQ', 81, true),
    new KeyEntry('R', 'R', 'KeyR', 82, true),
    new KeyEntry('S', 'S', 'KeyS', 83, true),
    new KeyEntry('T', 'T', 'KeyT', 84, true),
    new KeyEntry('U', 'U', 'KeyU', 85, true),
    new KeyEntry('V', 'V', 'KeyV', 86, true),
    new KeyEntry('W', 'W', 'KeyW', 87, true),
    new KeyEntry('X', 'X', 'KeyX', 88, true),
    new KeyEntry('Y', 'Y', 'KeyY', 89, true),
    new KeyEntry('Z', 'Z', 'KeyZ', 90, true),
    new KeyEntry('[', '[', 'BracketLeft', 219, false),
    new KeyEntry('\\', '\\', 'Backslash', 220, false),
    new KeyEntry(']', ']', 'BracketRight', 221, false),
    new KeyEntry('^', '^', 'Digit6', 54, true),
    new KeyEntry('_', '_', 'Minus', 173, true),
    new KeyEntry('`', '`', 'Backquote', 192, false),
    new KeyEntry('a', 'a', 'KeyA', 65, false),
    new KeyEntry('b', 'b', 'KeyB', 66, false),
    new KeyEntry('c', 'c', 'KeyC', 67, false),
    new KeyEntry('d', 'd', 'KeyD', 68, false),
    new KeyEntry('e', 'e', 'KeyE', 69, false),
    new KeyEntry('f', 'f', 'KeyF', 70, false),
    new KeyEntry('g', 'g', 'KeyG', 71, false),
    new KeyEntry('h', 'h', 'KeyH', 72, false),
    new KeyEntry('i', 'i', 'KeyI', 73, false),
    new KeyEntry('j', 'j', 'KeyJ', 74, false),
    new KeyEntry('k', 'k', 'KeyK', 75, false),
    new KeyEntry('l', 'l', 'KeyL', 76, false),
    new KeyEntry('m', 'm', 'KeyM', 77, false),
    new KeyEntry('n', 'n', 'KeyN', 78, false),
    new KeyEntry('o', 'o', 'KeyO', 79, false),
    new KeyEntry('p', 'p', 'KeyP', 80, false),
    new KeyEntry('q', 'q', 'KeyQ', 81, false),
    new KeyEntry('r', 'r', 'KeyR', 82, false),
    new KeyEntry('s', 's', 'KeyS', 83, false),
    new KeyEntry('t', 't', 'KeyT', 84, false),
    new KeyEntry('u', 'u', 'KeyU', 85, false),
    new KeyEntry('v', 'v', 'KeyV', 86, false),
    new KeyEntry('w', 'w', 'KeyW', 87, false),
    new KeyEntry('x', 'x', 'KeyX', 88, false),
    new KeyEntry('y', 'y', 'KeyY', 89, false),
    new KeyEntry('z', 'z', 'KeyZ', 90, false),
    new KeyEntry('{', '{', 'BracketLeft', 219, true),
    new KeyEntry('|', '|', 'Backslash', 220, true),
    new KeyEntry('}', '}', 'BracketRight', 221, true),
    new KeyEntry('~', '~', 'Backquote', 192, true),
    new KeyEntry('Alt', '', 'AltLeft', 18, false, {identifier: 'AltLeft'}),
    new KeyEntry('Alt', '', 'AltRight', 18, false, {identifier: 'AltRight'}),
    new KeyEntry('ArrowDown', '', 'ArrowDown', 40, false),
    new KeyEntry('ArrowLeft', '', 'ArrowLeft', 37, false),
    new KeyEntry('ArrowRight', '', 'ArrowRight', 39, false),
    new KeyEntry('ArrowUp', '', 'ArrowUp', 38, false),
    new KeyEntry('Backspace', '', 'Backspace', 8, false),
    // TODO: new KeyEntry('CapsLock', '', 'CapsLock', 20, false),
    new KeyEntry('ContextMenu', '', 'ContextMenu', 93, false),
    new KeyEntry('Control', '', 'ControlLeft', 17, false, {identifier: 'ControlLeft'}),
    new KeyEntry('Control', '', 'ControlRight', 17, false, {identifier: 'ControlRight'}),
    new KeyEntry('Delete', '', 'Delete', 46, false),
    new KeyEntry('End', '', 'End', 35, false),
    new KeyEntry('Enter', '\n', 'Enter', 13, false),
    new KeyEntry('Escape', '', 'Escape', 27, false),
    new KeyEntry('F1', '', 'F1', 112, false),
    new KeyEntry('F2', '', 'F2', 113, false),
    new KeyEntry('F3', '', 'F3', 114, false),
    new KeyEntry('F4', '', 'F4', 115, false),
    new KeyEntry('F5', '', 'F5', 116, false),
    new KeyEntry('F6', '', 'F6', 117, false),
    new KeyEntry('F7', '', 'F7', 118, false),
    new KeyEntry('F8', '', 'F8', 119, false),
    new KeyEntry('F9', '', 'F9', 120, false),
    new KeyEntry('F10', '', 'F10', 121, false),
    new KeyEntry('F11', '', 'F11', 122, false),
    new KeyEntry('F12', '', 'F12', 123, false),
    new KeyEntry('F13', '', 'F13', 44, false),
    new KeyEntry('Home', '', 'Home', 36, false),
    new KeyEntry('Meta', '', 'OSLeft', 224, false, {identifier: 'OSLeft'}),
    new KeyEntry('Meta', '', 'OSRight', 224, false, {identifier: 'OSRight'}),
    new KeyEntry('PageDown', '', 'PageDown', 34, false),
    new KeyEntry('PageUp', '', 'PageUp', 33, false),
    new KeyEntry('Shift', '', 'ShiftLeft', 16, false, {identifier: 'ShiftLeft'}),
    new KeyEntry('Shift', '', 'ShiftRight', 16, false, {identifier: 'ShiftRight'}),
    // TODO new KeyEntry('Tab', '\t', 'Tab', 9, false),
]);

const keys = new Map(entries.map(entry => [entry.identifier, entry]));

/* istanbul ignore if */
if (keys.size !== entries.length) {
    throw Error('Duplicate KeyEntry identifier!');
}

const fromKeyIdentifier = key => keys.get(key);
const parseKeyIdentifiers = identifiers => {
    const invalidKeys = [];
    const keyEntries = identifiers.map(identifier => {
        const entry = fromKeyIdentifier(identifier);
        if (!entry) {
            invalidKeys.push(identifier);
        }
        return entry;
    });

    if (invalidKeys.length) {
        throw illegalArgumentError(`The following keys are not supported: "${invalidKeys.join('", "')}"`);
    }

    return keyEntries;
};

module.exports = {
    fromKeyIdentifier,
    parseKeyIdentifiers,
    SHIFT_KEY: fromKeyIdentifier('ShiftLeft'),
};
