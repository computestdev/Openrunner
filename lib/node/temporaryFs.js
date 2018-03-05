'use strict';
const fs = require('fs-extra');
const path = require('path');
const Promise = require('bluebird');

const log = require('../logger')({MODULE: 'node/cli'});

const temporaryDirectory = (tmpDir, names) => Promise.try(async () => {
    // caveat: we may forget to clean up (empty) temp directories if some, but not all, mkdtemp calls fail
    return await Promise.all(names.map(name => fs.mkdtemp(path.join(tmpDir, name))));
})
.disposer(async paths => {
    log.debug({paths}, 'Cleaning up temporary directories...');
    await Promise.all(paths.map(path => fs.remove(path)));
});

module.exports = {temporaryDirectory};
