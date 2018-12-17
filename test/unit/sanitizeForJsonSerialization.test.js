'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {strictEqual: eq, notStrictEqual: neq, deepEqual: deq}} = require('chai');

const sanitizeForJsonSerialization = require('../../lib/sanitizeForJsonSerialization');

describe('sanitizeForJsonSerialization', () => {
    const REPLACEMENT = 'TEST Replacement value';
    const sanitize = value => sanitizeForJsonSerialization(value, REPLACEMENT);

    it('Should return primitive values as-is', () => {
        eq(sanitize(false), false);
        eq(sanitize(true), true);
        eq(sanitize(true), true);
        eq(sanitize(null), null);
        eq(sanitize(undefined), undefined);
        eq(sanitize(''), '');
        eq(sanitize('foo'), 'foo');
        eq(sanitize(123), 123);
    });

    it('Should clone arrays', () => {
        {
            const value = [123];
            neq(sanitize(value), value, 'should clone arrays');
        }
        deq(sanitize([123]), [123]);
        deq(sanitize([123, [456]]), [123, [456]]);
        deq(sanitize([]), []);
    });

    it('Should clone simple objects', () => {
        {
            const value = {foo: 123};
            neq(sanitize(value), value, 'should clone objects');
        }
        deq(sanitize({foo: 123}), {foo: 123});
        deq(sanitize({foo: [123]}), {foo: [123]});
        deq(sanitize({}), {});
        deq(sanitize(Object.create(null)), {});
    });

    it('Should filter objects with a prototype', () => {
        class Foo {}

        deq(sanitize({
            foo: 123,
            bar: new Foo(),
            baz: new Error(),
            quux: {
                foo: new Foo(),
            },
        }), {
            foo: 123,
            bar: REPLACEMENT,
            baz: REPLACEMENT,
            quux: {
                foo: REPLACEMENT,
            },
        });
    });

    it('Should filter Symbol()', () => {
        deq(sanitize({
            foo: Symbol(),
            [Symbol()]: 123,
            bar: 456,
        }), {
            foo: REPLACEMENT,
            bar: 456,
        });
    });
});
