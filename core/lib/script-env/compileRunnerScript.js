'use strict';
// "not being evaluated by a direct call": http://www.ecma-international.org/ecma-262/5.1/#sec-10.4.
const evalNoScope = eval; // eslint-disable-line no-eval

// todo: use a Cu.sandbox / realm when that gets implemented
// https://bugzilla.mozilla.org/show_bug.cgi?id=1353468

const compileRunnerScript = scriptContent => {
    return evalNoScope(`(async (include, transaction) => { 'use strict'; ${scriptContent}\n})`);
};

module.exports = compileRunnerScript;
