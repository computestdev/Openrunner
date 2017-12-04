'use strict';
/* global document:false */

const {observeDocument} = require('./mutationEvents');

openRunnerRegisterRunnerModule('mutationEvents', async ({getModule}) => {
    const {scriptResult} = await getModule('runResult');
    observeDocument(document, scriptResult);
});
