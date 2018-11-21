/* global window:false */
'use strict';

const registerRunnerModule = (...args) => {
    window.dispatchEvent(new window.Event('openrunnerinitmoduleframework'));
    return window.openRunnerRegisterRunnerModule(...args);
};

module.exports = registerRunnerModule;
