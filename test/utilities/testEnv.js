'use strict';
/* eslint-env node */
const path = require('path');

const {env} = process;

const TEST_TEMP_DIR = env.TEST_TEMP_DIR
    ? path.resolve(env.TEST_TEMP_DIR)
    : path.resolve(__dirname, '..', '..', 'PRIV', 'temp');

const {
    TEST_FIREFOX_BIN,
    TEST_SERVER_PORT = '0', // 0 = pick a random free port
    TEST_SERVER_BAD_TLS_PORT = '0', // 0 = pick a random free port
} = env;

module.exports = Object.freeze({
    TEST_TEMP_DIR,
    TEST_FIREFOX_BIN,
    TEST_SERVER_PORT,
    TEST_SERVER_BAD_TLS_PORT,
});
