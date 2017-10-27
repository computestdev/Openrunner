'use strict';
const chai = require('chai');
const chaiSubset = require('chai-subset');
const chaiArrays = require('chai-arrays');
const chaiDom = require('chai-dom');

chai.use(chaiSubset);
chai.use(chaiArrays);
chai.use(chaiDom);

module.exports = () => {
    return Object.freeze({
        expect: chai.expect,
        assert: chai.assert,
    });
};
