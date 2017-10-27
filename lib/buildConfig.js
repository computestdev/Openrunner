'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const config = require('openRunnerBuildConfig'); // browserify magic

const DEFAULT_CONFIG = {
    cncLoopbackPort: 0, // 0 = disabled
};

module.exports = Object.assign({}, DEFAULT_CONFIG, config);
