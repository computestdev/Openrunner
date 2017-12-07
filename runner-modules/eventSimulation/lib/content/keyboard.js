'use strict';
const findPropertyInChain = require('../../../../lib/findPropertyInChain');
const {getOwnerDocument, getDocumentWindow, assertIsNodeType, ELEMENT_NODE} = require('../../../../lib/domUtilities');
const {parseKeyIdentifiers, SHIFT_KEY} = require('./keys');
const {focus} = require('./focus');
const delay = require('../../../../lib/delay');

const NOOP = () => {};

const keyDown = (window, element, keyEntry) => {
    const event = new window.KeyboardEvent('keydown', Object.assign(
        keyEntry.getEventInit('keydown'),
        {view: window}
    ));
    return element.dispatchEvent(event); // returns false if cancelled
};
const keyUp = (window, element, keyEntry) => {
    const event = new window.KeyboardEvent('keyup', Object.assign(
        keyEntry.getEventInit('keyup'),
        {view: window}
    ));
    return element.dispatchEvent(event);
};
const keyDownUp = (window, element, keyEntry, down) => (down ? keyDown(window, element, keyEntry) : keyUp(window, element, keyEntry));
const keyPress = (window, element, keyEntry) => {
    const event = new window.KeyboardEvent('keypress', Object.assign(
        keyEntry.getEventInit('keypress'),
        {view: window}
    ));
    return element.dispatchEvent(event);
};

const keyboardKeys = async (
    element,
    keyIdentifiers,
    {
        keyInterval = 0,
        keyDownDuration = 0,
        _handleInput = NOOP,
        _handleChange = NOOP,
    } = {}
) => {
    assertIsNodeType(element, ELEMENT_NODE, 'keyboardKeys(): First argument: ');
    const window = getDocumentWindow(getOwnerDocument(element));
    const keyEntries = parseKeyIdentifiers(keyIdentifiers);

    let first = true;
    let shiftState = false;
    let performedChange = false;

    for (const keyEntry of keyEntries) {
        if (!first) {
            await delay(keyInterval);
        }
        first = false;

        if (keyEntry.shift !== shiftState) {
            shiftState = keyEntry.shift;
            keyDownUp(window, element, SHIFT_KEY, shiftState);
        }

        const keyDownPerformDefault = keyDown(window, element, keyEntry);
        if (keyDownPerformDefault) {
            const keyPressPerformDefault = keyEntry.firesKeyPress
                ? keyPress(window, element, keyEntry)
                : true;

            if (keyPressPerformDefault) {
                performedChange = _handleInput(window, element, keyEntry, shiftState) || performedChange;
            }
        }
        keyUp(window, element, keyEntry);
        await delay(keyDownDuration);
    }

    if (shiftState) {
        keyUp(window, element, SHIFT_KEY);
    }

    if (performedChange) {
        await delay(keyDownDuration);
        _handleChange(window, element);
    }
};

const isTextValueControl = element => {
    const elementTagName = element.tagName.toUpperCase();

    if (elementTagName === 'TEXTAREA') {
        return true;
    }

    if (elementTagName === 'INPUT') {
        switch (element.type) {
            case 'text':
            case 'search':
            case 'tel':
            case 'url':
            case 'email':
            case 'password':
            case 'number':
                return true;
        }
    }

    return false;
};

const keyboardTextInput = async (element, keyIdentifiers, options = {}) => {
    assertIsNodeType(element, ELEMENT_NODE, 'keyboardTextInput(): First argument: ');
    const window = getDocumentWindow(getOwnerDocument(element));
    const {InputEvent, UIEvent, document} = window;

    const isElementTextValueControl = isTextValueControl(element);
    const isElementContentEditable = element.isContentEditable;

    if (!isElementTextValueControl && !isElementContentEditable) {
        throw new TypeError(
            `keyboardTextInput(): (${element.nodeName} ${element.type || ''}) is not a valid element for text input`
        );
    }

    if (findPropertyInChain(document, 'activeElement').get.call(document) !== element) {
        focus(element);
    }

    const handleInput = (window, element, keyEntry, shiftState) => {
        const {characterValue} = keyEntry;

        // TODO: for now, text is always inserted at the end of the input, ignoring the current selection
        if (!characterValue) {
            // TODO: for now, only actual text is inputted, ignoring things such as arrow keys, tab, etc
            return false; // no change to the control's value
        }

        const inputPerformDefault = element.dispatchEvent(new InputEvent('beforeinput', {
            data: characterValue,
            isComposing: false,
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,
        }));

        if (inputPerformDefault) {
            if (isElementTextValueControl) {
                element.value += characterValue;
            }
            else if (isElementContentEditable) {
                element.insertAdjacentText('beforeend', characterValue);
            }

            element.dispatchEvent(new InputEvent('input', {
                data: characterValue,
                isComposing: false,
                view: window,
                bubbles: true,
                cancelable: false,
                composed: true,
            }));

            return true; // the control's value changed
        }

        return false; // no change to the control's value
    };

    const handleChange = (window, element) => {
        // normally the change event does not fire until the element loses focus
        // however for convenience we fire it right away

        if (isElementTextValueControl) {
            element.dispatchEvent(new UIEvent('change', {
                view: window,
                bubbles: true,
                cancelable: false,
                composed: false,
            }));
        }
        // "change" does not fire for contentEditable
    };

    await keyboardKeys(element, keyIdentifiers, Object.assign({_handleInput: handleInput, _handleChange: handleChange}, options));
};

module.exports = {keyboardKeys, keyboardTextInput};
