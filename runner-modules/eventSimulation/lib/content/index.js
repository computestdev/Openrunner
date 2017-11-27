'use strict';

const {click} = require('./mouse');

openRunnerRegisterRunnerModule('eventSimulation', async () => {
    return Object.freeze({
        click,
    });
});
