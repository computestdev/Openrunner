'use strict';
const {assert} = require('chai');

const mergeCoverageCounter = (to, from) => {
    for (const [id, fromCounter] of Object.entries(from)) {
        if (typeof fromCounter === 'number') {
            const toCounter = to[id] || 0;
            to[id] = toCounter + fromCounter;
        }
        else if (Array.isArray(fromCounter)) { // branch coverage
            const toCounter = to[id] = to[id] || [];
            const length = Math.max(toCounter.length, fromCounter.length);
            for (let i = 0; i < length; ++i) {
                toCounter[i] = (toCounter[i] || 0) + (fromCounter[i] || 0);
            }
        }
    }
};

const mergeCoverageReports = async (to, ...fromArgs) => {
    for (const from of fromArgs) {
        for (const [key, fromReport] of Object.entries(from)) {
            const toReport = to[key];
            if (!toReport) {
                to[key] = fromReport;
                continue;
            }

            assert.deepEqual(toReport.statementMap, fromReport.statementMap, `mergeCoverageReports(): statementMap of ${key} must match`);
            assert.deepEqual(toReport.fnMap, fromReport.fnMap, `mergeCoverageReports(): fnMap of ${key} must match`);
            assert.deepEqual(toReport.branchMap, fromReport.branchMap, `mergeCoverageReports(): branchMap of ${key} must match`);

            mergeCoverageCounter(toReport.s, fromReport.s); // statement counters
            mergeCoverageCounter(toReport.f, fromReport.f); // function counters
            mergeCoverageCounter(toReport.b, fromReport.b); // branch counters
        }
    }
};

exports.mergeCoverageCounter = mergeCoverageCounter;
exports.mergeCoverageReports = mergeCoverageReports;
