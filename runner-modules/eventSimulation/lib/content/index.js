'use strict';

const {click} = require('./mouse');
const {focus} = require('./focus');

openRunnerRegisterRunnerModule('eventSimulation', async () => {
    return Object.freeze({
        click,
        focus,
    });
});
