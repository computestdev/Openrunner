'use strict';
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
        throw new TypeError(`${message}Expected value to be a DOM Node`);
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
        throw new TypeError(fullMessage);
    }
};

const getOwnerDocument = node => findPropertyInChain(node, 'ownerDocument').get.call(node);
const getDocumentWindow = document => findPropertyInChain(document, 'defaultView').get.call(document);

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
};
