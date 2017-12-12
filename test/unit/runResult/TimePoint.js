'use strict';

const TimePoint = require('../../../runner-modules/runResult/lib/TimePoint');

let counterFunc;

TimePoint.setCounterFunc(() => counterFunc());

const replaceCounterFunc = (func) => {
    counterFunc = func;
};

module.exports = {TimePoint, replaceCounterFunc};
