'use strict';

openRunnerRegisterRunnerModule('assert', async ({script}) => {
    const chai = await script.include('chai');
    return chai.assert;
});
