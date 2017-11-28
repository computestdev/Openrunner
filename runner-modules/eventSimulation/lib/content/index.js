'use strict';

const {click} = require('./mouse');
const {focus} = require('./focus');

openRunnerRegisterRunnerModule('eventSimulation', async ({getModule}) => {
    const {scriptResult} = await getModule('runResult');

    return Object.freeze({
        click: async (element, {x = null, y = null, mouseDownDuration = 64} = {}) => {
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
    });
});
