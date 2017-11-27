'use strict';
const delay = require('../../../../lib/delay');
const {getOwnerDocument, getDocumentWindow, assertIsNodeType, ELEMENT_NODE} = require('../../../../lib/domUtilities');

const BROWSER_WINDOW_NAVIGATION_BAR_SIZE = 72;
const BROWSER_WINDOW_LEFT_BORDER_SIZE = 0;

const click = async (element, {x = null, y = null, mouseDownDuration = 64} = {}) => {
    assertIsNodeType(element, ELEMENT_NODE, 'simulateClick(): First argument: ');

    const window = getDocumentWindow(getOwnerDocument(element));
    const {MouseEvent} = window;

    const {
        x: elementX, y: elementY,
        width: elementWidth, height: elementHeight,
    } = element.getBoundingClientRect(); // relative to the viewport (scrolling changes this value)
    const relativeX = x === null ? Math.floor(elementWidth / 2) : Number(x);
    const relativeY = y === null ? Math.floor(elementHeight / 2) : Number(y);
    // clientX and clientY are relative to the top left of the viewport, if the user scrolls the page, they change
    const clientX = elementX + relativeX;
    const clientY = elementY + relativeY;
    // screenX and screenY are relative to the top left of the actual screen, so it is affected by the
    // browser GUI (navigation bar, tab bar, etc)
    const screenX = clientX + BROWSER_WINDOW_LEFT_BORDER_SIZE;
    const screenY = clientY + BROWSER_WINDOW_NAVIGATION_BAR_SIZE;
    const button = 0; // left mouse
    const buttons = 1; // left mouse

    // 1. mousedown
    // 2. wait
    // 3. mouseup
    // 4. click (same timeStamp as mouseup)
    // relatedTarget is null for all events, they all bubble and they are all cancelable
    // canceling (preventDefault) one of the events has no effect on the other events

    element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        screenX, screenY,
        clientX, clientY,
        button,
        buttons,
        relatedTarget: null,
        view: window,
    }));

    await delay(Number(mouseDownDuration));

    element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        composed: true,
        screenX, screenY,
        clientX, clientY,
        button,
        buttons,
        relatedTarget: null,
        view: window,
    }));

    element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        screenX, screenY,
        clientX, clientY,
        button,
        buttons,
        relatedTarget: null,
        view: window,
    }));
};

exports.click = click;
