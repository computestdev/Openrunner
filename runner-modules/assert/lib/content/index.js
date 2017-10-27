'use strict';

openRunnerRegisterRunnerModule('assert', async ({getModule}) => {
    const chai = await getModule('chai');
    return chai.assert;
});
