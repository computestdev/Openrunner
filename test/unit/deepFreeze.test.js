'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {isTrue, isFalse, strictEqual: eq}} = require('chai');

const deepFreeze = require('../../lib/deepFreeze');

describe('deepFreeze', () => {
    it('Should freeze the given object and repeat this for all "own" object properties', () => {
        const object = {
            foo: 123,
            bar: 'zzz',
            baz: {
                foo: 1234,
                bar: {
                    foo: 123,
                },
                baz: 'efe',
            },
            quux: [
                123,
                {
                    foo: 455,
                    bar: 492,
                },
            ],
        };

        eq(deepFreeze(object), object);
        isTrue(Object.isFrozen(object));
        isTrue(Object.isFrozen(object.baz));
        isTrue(Object.isFrozen(object.baz.bar));
        isTrue(Object.isFrozen(object.quux));
        isTrue(Object.isFrozen(object.quux[1]));
    });

    it('Should do nothing for falsy values', () => {
        eq(deepFreeze(), undefined);
        eq(deepFreeze(null), null);
    });

    it('Should ignore inherited properties', () => {
        function Foo() {
            this.baz = {foo: 456};
        }
        Foo.prototype.bar = {foo: 123};

        const object = new Foo();
        deepFreeze(object);
        isTrue(Object.isFrozen(object));
        isFalse(Object.isFrozen(object.bar));
        isTrue(Object.isFrozen(object.baz));
    });
});
