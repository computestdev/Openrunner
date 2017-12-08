'use strict';
/* global window */
const chai = require('chai');
const chaiSubset = require('chai-subset');
const chaiAsPromised = require('chai-as-promised');
const chaiDom = require('chai-dom');

chai.use(chaiSubset);
chai.use(chaiAsPromised);
if (typeof window === 'object' && window.HTMLDocument) {
    chai.use(chaiDom);
}
chai.config.truncateThreshold = 1024;

module.exports = () => {
    return Object.freeze({
        expect: chai.expect,
        assert: chai.assert,
    });
};
