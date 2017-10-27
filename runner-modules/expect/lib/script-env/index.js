'use strict';

openRunnerRegisterRunnerModule('expect', async ({script}) => {
    const chai = await script.include('chai');
    return chai.expect;
});
