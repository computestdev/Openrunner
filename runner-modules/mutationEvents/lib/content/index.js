'use strict';
/* global document:false */
const {observeDocument} = require('./mutationEvents');
const registerRunnerModule = require('../../../content-register');

registerRunnerModule('mutationEvents', async ({getModule}) => {
    const {scriptResult} = await getModule('runResult');
    observeDocument(document, scriptResult);
});
