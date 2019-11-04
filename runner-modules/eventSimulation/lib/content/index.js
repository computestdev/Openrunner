'use strict';
const {click} = require('./mouse');
const {keyboardKeys, keyboardTextInput} = require('./keyboard');
const {focus} = require('./focus');
const registerRunnerModule = require('../../../content-register');

const DEFAULT_MOUSE_DOWN_DURATION = 64;
const DEFAULT_KEY_INTERVAL = 10;
const DEFAULT_KEY_DOWN_DURATION = 5;

registerRunnerModule('eventSimulation', async ({getModule}) => {
    const {scriptResult} = await getModule('runResult');

    return Object.freeze({
        click: async (element, {x = null, y = null, mouseDownDuration = DEFAULT_MOUSE_DOWN_DURATION} = {}) => {
            await scriptResult.execEvent('command:eventSimulation.click', async event => {
                await click(element, {x, y, mouseDownDuration});
                event.shortTitle = 'Click on element';
                event.setMetaData('mouseDownDuration', mouseDownDuration);
            });
        },
        focus: async element => {
            await scriptResult.execEvent('command:eventSimulation.focus', event => {
                focus(element);
                event.shortTitle = 'Focus an element';
            });
        },
        keyboardKeys: async (
            element,
            keyIdentifiers,
            {keyInterval = DEFAULT_KEY_INTERVAL, keyDownDuration = DEFAULT_KEY_DOWN_DURATION} = {},
        ) => {
            await scriptResult.execEvent('command:eventSimulation.keyboardKeys', async event => {
                await keyboardKeys(element, keyIdentifiers, {keyInterval, keyDownDuration});
                event.shortTitle = 'Send key events to an element';
                event.setMetaData('keys', keyIdentifiers);
                event.setMetaData('keyInterval', keyInterval);
                event.setMetaData('keyDownDuration', keyDownDuration);
            });
        },
        keyboardTextInput: async (
            element,
            keyIdentifiers,
            {keyInterval = DEFAULT_KEY_INTERVAL, keyDownDuration = DEFAULT_KEY_DOWN_DURATION} = {},
        ) => {
            await scriptResult.execEvent('command:eventSimulation.keyboardTextInput', async event => {
                await keyboardTextInput(element, keyIdentifiers, {keyInterval, keyDownDuration});
                event.shortTitle = 'Send text input to an element';
                event.setMetaData('keys', keyIdentifiers);
                event.setMetaData('keyInterval', keyInterval);
                event.setMetaData('keyDownDuration', keyDownDuration);
            });
        },
    });
});
