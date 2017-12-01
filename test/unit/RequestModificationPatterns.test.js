'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert, assert: {throws, strictEqual: eq, deepEqual: deq, isFunction}} = require('chai');
const sinon = require('sinon');

const RequestModificationPatterns = require('../../lib/RequestModificationPatterns');

describe('RequestModificationPatterns', () => {
    let listener;
    let emitter;
    let modificationPatterns;

    beforeEach(() => {
        listener = sinon.spy(() => 456);
        emitter = {
            addListener: sinon.spy(),
            removeListener: sinon.spy(),
        };

        modificationPatterns = new RequestModificationPatterns({
            browserWebRequestEmitter: emitter,
            extraInfoSpec: ['foo', 'bar'],
            browserWindowId: 123,
            listener,
        });
    });

    describe('.add()', () => {
        it('Should throw for invalid arguments', () => {
            throws(() => modificationPatterns.add('foo'), /patterns.*must.*array/i);
            throws(() => modificationPatterns.add([]), /patterns.*must.*non.*empty.*array/i);
            throws(() => modificationPatterns.add([123]), /patterns.*must.*array.*string/i);
        });

        it('Should register listeners for added patterns', () => {
            eq(emitter.addListener.callCount, 0);
            const id1 = modificationPatterns.add(['http://*.example.com/*', 'https://foo.bar/*'], 'extra data');
            eq(emitter.addListener.callCount, 1);
            isFunction(emitter.addListener.firstCall.args[0], 1);
            deq(emitter.addListener.firstCall.args[1], {urls: ['http://*.example.com/*', 'https://foo.bar/*'], windowId: 123});
            deq(emitter.addListener.firstCall.args[2], ['foo', 'bar']);

            const id2 = modificationPatterns.add(['<all_urls>']);
            eq(emitter.addListener.callCount, 2);

            const listener1 = emitter.addListener.firstCall.args[0];
            const listener2 = emitter.addListener.secondCall.args[0];

            assert(listener1 !== listener2, 'each added listener must be a unique function reference');
            assert(id1 !== id2, 'each added pattern must return a unique id');

            eq(listener.callCount, 0);
            eq(listener1('arg0', 'arg1'), 456);
            eq(listener.callCount, 1);
            deq(listener.firstCall.args, ['extra data', 'arg0', 'arg1']);

            eq(listener2('arg0 foo', 'arg1 foo'), 456);
            eq(listener.callCount, 2);
            deq(listener.secondCall.args, [null, 'arg0 foo', 'arg1 foo']);
        });
    });

    describe('.remove()', () => {
        it('Should unregister listeners when patterns are removed', () => {
            eq(modificationPatterns.remove(123), false);
            eq(emitter.removeListener.callCount, 0);

            const id1 = modificationPatterns.add(['http://*.example.com/*']);
            const id2 = modificationPatterns.add(['http://*.example.com/*']);
            eq(modificationPatterns.remove(id1), true);
            eq(emitter.removeListener.callCount, 1);
            eq(modificationPatterns.remove(id1), false);
            eq(emitter.removeListener.callCount, 1);
            deq(emitter.removeListener.firstCall.args, [emitter.addListener.firstCall.args[0]]);

            eq(modificationPatterns.remove(id2), true);
            eq(emitter.removeListener.callCount, 2);
            eq(modificationPatterns.remove(id2), false);
            eq(emitter.removeListener.callCount, 2);
            deq(emitter.removeListener.secondCall.args, [emitter.addListener.secondCall.args[0]]);
        });
    });

    describe('.removeAll()', () => {
        it('Should unregister all listeners that have been previously added', () => {
            const id1 = modificationPatterns.add(['http://*.example.com/*']);
            const id2 = modificationPatterns.add(['http://*.example.com/*']);
            modificationPatterns.removeAll();
            eq(emitter.removeListener.callCount, 2);
            deq(emitter.removeListener.firstCall.args, [emitter.addListener.firstCall.args[0]]);
            deq(emitter.removeListener.secondCall.args, [emitter.addListener.secondCall.args[0]]);

            eq(modificationPatterns.remove(id1), false);
            eq(modificationPatterns.remove(id2), false);
        });
    });
});
