'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const {assert, assert: {lengthOf, strictEqual: eq, throws}} = require('chai');
const {JSDOM} = require('jsdom');
const cssEscape = require('css.escape');

const domUtilities = require('../../lib/domUtilities');

describe('domUtilities', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        dom = new JSDOM('');
        ({window} = dom);
        ({document} = window);
    });

    afterEach(() => {
        window.close();
        dom = null;
        window = null;
        document = null;
    });

    describe('isNode', () => {
        it('Should return false for values that do not look like a DOM Node', () => {
            eq(domUtilities.isNode(), false);
            eq(domUtilities.isNode(false), false);
            eq(domUtilities.isNode(123), false);
            eq(domUtilities.isNode(true), false);
            eq(domUtilities.isNode({}), false);
        });

        it('Should return true for values that look like a DOM Node', () => {
            eq(domUtilities.isNode(document.createElement('div')), true);
            eq(domUtilities.isNode(document.createTextNode('abc')), true);
            eq(domUtilities.isNode(document.createComment('abc')), true);
            eq(domUtilities.isNode(document), true);
        });
    });

    describe('assertIsNode', () => {
        it('Should throw for values that are not a node', () => {
            throws(() => domUtilities.assertIsNode(), /Expected.*DOM.*Node/i);
            throws(() => domUtilities.assertIsNode(false), /Expected.*DOM.*Node/i);
            throws(() => domUtilities.assertIsNode({}), /Expected.*DOM.*Node/i);
            throws(() => domUtilities.assertIsNode({}, 'Foo '), /Foo .*Expected.*DOM.*Node/i);
        });

        it('Should not throw for Node values', () => {
            domUtilities.assertIsNode(document.createElement('div'));
            domUtilities.assertIsNode(document);
        });
    });

    describe('assertIsNodeType', () => {
        it('Should throw for values that are not a node', () => {
            throws(() => domUtilities.assertIsNodeType(undefined, 3), /Expected.*DOM.*Node/i);
            throws(() => domUtilities.assertIsNodeType(false, 3), /Expected.*DOM.*Node/i);
            throws(() => domUtilities.assertIsNodeType({}, 3), /Expected.*DOM.*Node/i);
        });

        it('Should throw for the incorrect node type', () => {
            throws(() => domUtilities.assertIsNodeType(document.createElement('div'), 3), /Expected.*Text.*Node.*instead.*Element.*Node/i);
        });

        it('Should not throw for the correct node type', () => {
            domUtilities.assertIsNode(document.createTextNode('foo bar'));
        });
    });

    describe('getOwnerDocument', () => {
        it('Should return the owner document', () => {
            assert(domUtilities.getOwnerDocument(document.createElement('div')) === document);
        });
    });

    describe('getDocumentWindow', () => {
        it('Should return the defaultView of the given document', () => {
            assert(domUtilities.getDocumentWindow(document) === window);
        });
    });

    describe('getElementIndex', () => {
        it('Should return NaN for elements without a parent', () => {
            assert(Number.isNaN(domUtilities.getElementIndex(document.createElement('div'))));
        });

        it('Should return the number of previous element siblings', () => {
            const parent = document.createElement('div');
            parent.innerHTML = `
                <a>foo</a>
                <b>bar</b>
                <div>baz</div>
                <section>quux</section>
            `;

            eq(domUtilities.getElementIndex(parent.children[0]), 0);
            eq(domUtilities.getElementIndex(parent.children[1]), 1);
            eq(domUtilities.getElementIndex(parent.children[2]), 2);
            eq(domUtilities.getElementIndex(parent.children[3]), 3);
        });
    });

    describe('addNodeToAncestorSet', () => {
        it('Should add all nodes if they are disconnected', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createTextNode('foo roh dah'),
            ];

            const result = new Set();
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 3);
            eq(resultArray[0], nodes[0]);
            eq(resultArray[1], nodes[1]);
            eq(resultArray[2], nodes[2]);
        });

        it('Should not add duplicates', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createTextNode('foo roh dah'),
            ];

            const result = new Set();
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 3);
            eq(resultArray[0], nodes[0]);
            eq(resultArray[1], nodes[1]);
            eq(resultArray[2], nodes[2]);
        });

        it('Should only add a node if its parent is not already present', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createTextNode('foo roh dah'),
            ];
            nodes[0].appendChild(nodes[1]);
            nodes[0].appendChild(nodes[2]);

            const result = new Set();
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 1);
            eq(resultArray[0], nodes[0]);
        });

        it('Should remove a node from the set if its parent is added', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createTextNode('foo roh dah'),
            ];
            nodes[0].appendChild(nodes[1]);
            nodes[0].appendChild(nodes[2]);

            const result = new Set();
            for (const element of [...nodes].reverse()) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 1);
            eq(resultArray[0], nodes[0]);
        });

        it('Should only add a node if its ancestor is not already present', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createElement('div'),
                document.createElement('h1'),
                document.createTextNode('foo roh dah'),
            ];
            nodes[0].appendChild(nodes[1]);
            nodes[1].appendChild(nodes[2]);
            nodes[2].appendChild(nodes[3]);
            nodes[3].appendChild(nodes[4]);

            const result = new Set();
            for (const element of nodes) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 1);
            eq(resultArray[0], nodes[0]);
        });

        it('Should remove a node from the set if its ancestor is added', () => {
            const nodes = [
                document.createElement('div'),
                document.createElement('div'),
                document.createElement('div'),
                document.createElement('h1'),
                document.createTextNode('foo roh dah'),
            ];
            nodes[0].appendChild(nodes[1]);
            nodes[1].appendChild(nodes[2]);
            nodes[2].appendChild(nodes[3]);
            nodes[3].appendChild(nodes[4]);

            const result = new Set();
            for (const element of [...nodes].reverse()) {
                domUtilities.addNodeToAncestorSet(result, element);
            }

            const resultArray = [...result];
            lengthOf(resultArray, 1);
            eq(resultArray[0], nodes[0]);
        });
    });

    describe('getUniqueSelector', () => {
        it('Should return a CSS selector that is unique in the given document or disconnected tree', () => {
            if (!window.CSS) {
                // not yet implemented in JSDOM
                window.CSS = {
                    escape: cssEscape,
                };
            }

            const parent = document.createElement('div');
            parent.appendChild(document.createElement('p'));
            parent.appendChild(document.createTextNode('foo'));
            parent.appendChild(document.createElement('p'));
            parent.appendChild(document.createElement('p'));
            parent.appendChild(document.createTextNode('foo'));
            parent.appendChild(document.createElement('span'));
            const script = document.createElement('script');
            script.setAttribute('src', '/foo.js');
            parent.appendChild(script);

            parent.id = 'parent';
            parent.children[1].id = 'foo>bar';
            parent.children[2].className = 'foo b#ar';
            parent.children[3].id = 'bla';
            parent.children[3].className = 'bar';

            eq(domUtilities.getUniqueSelector(parent), 'div#parent');
            eq(domUtilities.getUniqueSelector(parent.children[0]), 'div#parent > p:nth-child(1)');
            eq(domUtilities.getUniqueSelector(parent.children[1]), 'div#parent > p#foo\\>bar:nth-child(2)');
            eq(domUtilities.getUniqueSelector(parent.children[2]), 'div#parent > p.b\\#ar.foo:nth-child(3)');
            eq(domUtilities.getUniqueSelector(parent.children[3]), 'div#parent > span#bla.bar:nth-child(4)');
            eq(domUtilities.getUniqueSelector(parent.children[3], {includeAncestors: false}), 'span#bla.bar:nth-child(4)');
            eq(domUtilities.getUniqueSelector(script), 'div#parent > script[src=\\/foo\\.js]:nth-child(5)');
            eq(domUtilities.getUniqueSelector(document.documentElement), 'html');
            eq(domUtilities.getUniqueSelector(document.head), 'html > head');
            eq(domUtilities.getUniqueSelector(document.body), 'html > body');
        });
    });
});
