'use strict';

openRunnerRegisterRunnerModule('expect', async ({getModule}) => {
    const chai = await getModule('chai');
    return chai.expect;
});
