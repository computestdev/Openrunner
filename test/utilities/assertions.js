'use strict';
/* eslint-disable no-console */
const {assert} = require('chai');

const isMeasurementDuration = (actualDuration, minimalDuration, maximumOverhead = 200, message = undefined) => {
    assert.isAtLeast(actualDuration, minimalDuration, message);

    try {
        assert.isAtMost(actualDuration, minimalDuration + maximumOverhead, message);
    }
    catch (err) {
        console.warn(
            'Warning: The following measurement duration assertion is very slow.',
            'This might be caused by a slow testing environment:',
            err.message,
            '\n',
            err.stack
        );
    }
};

module.exports = {isMeasurementDuration};
