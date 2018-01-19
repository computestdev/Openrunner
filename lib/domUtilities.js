'use strict';
const {illegalArgumentError} = require('./scriptErrors');
const findPropertyInChain = require('./findPropertyInChain');

// These constants are repeated here so that we can access them even if there is no DOM (yet)
// All of the obsolete node types have been excluded
const ELEMENT_NODE = 1;
const ATTRIBUTE_NODE = 2;
const TEXT_NODE = 3;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const DOCUMENT_TYPE_NODE = 10;
const DOCUMENT_FRAGMENT_NODE = 11;

const DOCUMENT_POSITION_CONTAINS = 8;
const DOCUMENT_POSITION_CONTAINED_BY = 16;

const NODE_TYPE_CONSTRUCTOR_NAME = Object.freeze({
    [ATTRIBUTE_NODE]: 'Attr',
    [COMMENT_NODE]: 'Comment',
    [DOCUMENT_FRAGMENT_NODE]: 'DocumentFragment',
    [DOCUMENT_NODE]: 'Document',
    [DOCUMENT_TYPE_NODE]: 'DocumentType',
    [ELEMENT_NODE]: 'Element',
    [PROCESSING_INSTRUCTION_NODE]: 'ProcessingInstruction',
    [TEXT_NODE]: 'Text',
});

/**
 * Returns true if the given value looks like a DOM `Node`.
 *
 * Note that false positives exist because this check support multiple realms.
 *
 * @param {*} object
 * @return {boolean}
 */
const isNode = object => {
    if (!object) {
        return false;
    }

    // typeof document.createElement('object') === 'function'
    if (typeof object !== 'object' && typeof object !== 'function') {
        return false;
    }

    if (typeof object.nodeType !== 'number' || object.nodeType < 1) {
        return false;
    }

    if (typeof object.compareDocumentPosition !== 'function') {
        return false;
    }

    if (typeof object.hasChildNodes !== 'function') {
        return false;
    }

    return true;
};

/**
 * Throws if the given value does not look like a DOM Node. Also see dom.isNode()
 *
 * @param {*} object
 * @param {string} [message]
 * @throws Error
 */
const assertIsNode = (object, message = '') => {
    if (!isNode(object)) {
        throw illegalArgumentError(`${message}Expected value to be a DOM Node`);
    }
};

/**
 * Throws if the given value does not look like a DOM Node or if its nodeType does not match the expected value. Also see dom.isNode()
 *
 * @param {*} object
 * @param {number} nodeType
 * @param {string} [message]
 * @throws Error
 */
const assertIsNodeType = (object, nodeType, message = '') => {
    assertIsNode(object, message);

    if (object.nodeType !== nodeType) {
        const names = NODE_TYPE_CONSTRUCTOR_NAME;
        const fullMessage = `${message}Expected value to be a ${names[nodeType]} Node instead of a ${names[object.nodeType]} Node`;
        throw illegalArgumentError(fullMessage);
    }
};

const getOwnerDocument = node => findPropertyInChain(node, 'ownerDocument').get.call(node);
const getDocumentWindow = document => findPropertyInChain(document, 'defaultView').get.call(document);

/**
 * The number of previous element siblings.
 *
 * The following statement is always true: `element.parentNode.children[getElementIndex(element)] === element`
 * (unless there is no parent)
 *
 * @param {Element} element
 * @return {number}
 */
const getElementIndex = element => {
    assertIsNodeType(element, ELEMENT_NODE, 'getElementIndex(): First argument: ');

    if (!element.parentNode) {
        return NaN;
    }

    let index = 0;
    let sibling = element.previousElementSibling;

    while (sibling) {
        ++index;
        sibling = sibling.previousElementSibling;
    }

    return index;
};

/**
 * Add `node` to `set` in such a way that if multiple nodes are added, only the top most ancestor of those nodes end up in the set.
 *
 * If the nodes do not have a ancestor/descendant relation with each other, both will be added
 *
 * @param {Set} set
 * @param {Node} node
 */
const addNodeToAncestorSet = (set, node) => {
    for (const otherNode of set) {
        const compare = otherNode.compareDocumentPosition(node);

        if (compare === 0) { // same node
            return;
        }

        if (compare & DOCUMENT_POSITION_CONTAINS) { // node contains otherNode
            set.delete(otherNode);
        }
        else if (compare & DOCUMENT_POSITION_CONTAINED_BY) { // otherNode contains node
            return;
        }
    }
    set.add(node);
};

/**
 * Construct a unique selector for the given Element Node.
 *
 * The returned selector is very verbose and is meant to be manually shortened as needed.
 *
 * @param {Element} element
 * @param {Object} options
 * @param {boolean} [options.includeAncestors=true] Include exclusive ancestors in the selector string?
 * @return {string} CSS Selector
 */
const getUniqueSelector = (element, {includeAncestors = true} = {}) => {
    assertIsNodeType(element, ELEMENT_NODE, 'getUniqueSelector(): First argument: ');
    const {CSS} = getDocumentWindow(getOwnerDocument(element));
    const cssEscape = s => CSS.escape(s);

    let ancestor = element;
    let selector = '';

    while (ancestor && ancestor.nodeType === ELEMENT_NODE) {
        let selectorPart = ancestor.tagName.toLowerCase();

        const id = ancestor.getAttribute('id');
        const ancestorNodeName = ancestor.nodeName.toLowerCase();

        if (id) {
            selectorPart += '#' + cssEscape(id);
        }

        if (ancestor.classList.length) {
            const classes = [...ancestor.classList];
            classes.sort(); // make sure the order is always the same
            selectorPart += '.' + classes.map(cssEscape).join('.');
        }

        if (ancestorNodeName === 'script' && ancestor.hasAttribute('src')) {
            selectorPart += '[src=' + cssEscape(ancestor.getAttribute('src')) + ']';
        }

        if (ancestorNodeName !== 'html' &&
            ancestorNodeName !== 'head' &&
            ancestorNodeName !== 'body') {
            const index = getElementIndex(ancestor);

            if (index >= 0) {
                selectorPart += ':nth-child(' + (index + 1) + ')';
            }
        }

        selector = selector
            ? selectorPart + ' > ' + selector
            : selectorPart;

        ancestor = includeAncestors && ancestor.parentNode;
    }

    return selector;
};

module.exports = {
    ELEMENT_NODE,
    ATTRIBUTE_NODE,
    TEXT_NODE,
    PROCESSING_INSTRUCTION_NODE,
    COMMENT_NODE,
    DOCUMENT_NODE,
    DOCUMENT_TYPE_NODE,
    DOCUMENT_FRAGMENT_NODE,
    NODE_TYPE_CONSTRUCTOR_NAME,
    isNode,
    assertIsNode,
    assertIsNodeType,
    getOwnerDocument,
    getDocumentWindow,
    getElementIndex,
    addNodeToAncestorSet,
    getUniqueSelector,
};
