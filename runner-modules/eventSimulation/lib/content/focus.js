'use strict';
const {getOwnerDocument, getDocumentWindow, assertIsNodeType, ELEMENT_NODE} = require('../../../../lib/domUtilities');

/**
 * Focus the given element or document.
 *
 * If the browser window is focused, this function simply calls `element.focus()`. However if the browser window is
 * not in focus, the web browser will normally not fire any focus events; in this case this function will try to simulate the focus
 * events using `element.dispatchEvent()`.
 *
 * There is no `interact.blur()` function; `interact.focus(document.documentElement)` is the equivalent of `element.blur()`
 *
 * @param {Element} element
 */
const focus = element => {
    assertIsNodeType(element, ELEMENT_NODE, 'focus(): First argument: ');

    const window = getDocumentWindow(getOwnerDocument(element));
    const {document, FocusEvent} = window;

    if (document.hasFocus()) {
        // the browser will fire the appropriate events:
        element.focus();
        return;
    }
    // else: .focus() will not fire focus events because the firefox window or tab is not in focus; manually fire the focus/blur events

    const previousFocus = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;

    if (previousFocus) {
        previousFocus.blur(); // document.activeElement is set to <body> before blur fires

        previousFocus.dispatchEvent(new FocusEvent('blur', {
            bubbles: false,
            cancelable: false,
            composed: true,
            relatedTarget: element, // the element that will receive focus next
            view: window,
        }));

        previousFocus.dispatchEvent(new FocusEvent('focusout', {
            bubbles: true,
            cancelable: false,
            composed: true,
            relatedTarget: element,
            view: window,
        }));
    }

    element.focus(); // document.activeElement is set before the focus event fires

    element.dispatchEvent(new FocusEvent('focus', {
        bubbles: false,
        cancelable: false,
        composed: true,
        relatedTarget: previousFocus,
        view: window,
    }));

    element.dispatchEvent(new FocusEvent('focusin', {
        bubbles: true,
        cancelable: false,
        composed: true,
        relatedTarget: previousFocus,
        view: window,
    }));
};

exports.focus = focus;
