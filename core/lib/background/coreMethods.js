'use strict';

// const log = require('../logger')({hostname: 'background', MODULE: 'core/background/coreMethods'});

module.exports = script => {
    const include = async name => {
        await script.include(String(name));
        // do not return!
    };

    return new Map([
        ['core.include', include],
    ]);
};
