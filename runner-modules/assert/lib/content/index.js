'use strict';
const registerRunnerModule = require('../../../content-register');

registerRunnerModule('assert', async ({getModule}) => {
    const chai = await getModule('chai');
    return chai.assert;
});
