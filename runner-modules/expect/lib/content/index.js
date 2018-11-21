'use strict';
const registerRunnerModule = require('../../../content-register');

registerRunnerModule('expect', async ({getModule}) => {
    const chai = await getModule('chai');
    return chai.expect;
});
