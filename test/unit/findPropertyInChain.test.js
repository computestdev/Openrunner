'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, isNull}} = require('chai');

const findPropertyInChain = require('../../lib/findPropertyInChain');

describe('findPropertyInChain', () => {
    class Foo {}
    class Bar extends Foo {}
    Foo.prototype.foo = 'FOO';
    Bar.prototype.bar = 'BAR';

    it('Should walk the prototype chain of an object, returning the first property descriptor that matches', () => {
        const bar = new Bar();
        eq(findPropertyInChain(bar, 'foo').value, 'FOO');
        eq(findPropertyInChain(bar, 'bar').value, 'BAR');

        bar.foo = 'X';
        bar.bar = 'X';
        eq(findPropertyInChain(bar, 'foo').value, 'FOO');
        eq(findPropertyInChain(bar, 'bar').value, 'BAR');

        const foo = new Foo();
        eq(findPropertyInChain(foo, 'foo').value, 'FOO');
        isNull(findPropertyInChain(foo, 'bar'));

        foo.foo = 'X';
        foo.bar = 'X';
        eq(findPropertyInChain(foo, 'foo').value, 'FOO');
        isNull(findPropertyInChain(foo, 'bar'));
    });
});
