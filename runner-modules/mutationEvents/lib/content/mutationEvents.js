'use strict';
const {DOCUMENT_NODE, ELEMENT_NODE, addNodeToAncestorSet, getUniqueSelector} = require('../../../../lib/domUtilities');
const log = require('../../../../lib/logger')({hostname: 'content', MODULE: 'mutationEvents/content/mutationEvents'});

const observedDocuments = new WeakSet();

const observeDocument = (document, runResult) => {
    if (observedDocuments.has(document)) {
        throw Error('The given document is already being observed');
    }

    const window = document.defaultView;

    const observer = new window.MutationObserver(mutations => {
        try {
            handleMutations(document, runResult, mutations);
        }
        catch (err) {
            log.error({err}, 'Uncaught error in handleMutations()');
        }
    });

    observer.observe(document, {
        attributeOldValue: false,
        attributes: false, // todo?
        characterData: false, // todo?
        characterDataOldValue: false,
        childList: true,
        subtree: true,
    });

    observedDocuments.add(document);
};

const handleMutations = (document, runResult, mutations) => {
    const {TimePoint} = runResult;
    const startTime = new TimePoint();
    const addedElements = new Set();
    const removedElements = new Map(); // removed node -> old parent node
    let addedElementRawCount = 0;
    let removedElementRawCount = 0;

    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            const parent = mutation.target; // Either an Element or HTMLDocument
            const isParentDisconnected = !document.contains(parent);

            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== ELEMENT_NODE) {
                    continue;
                }

                ++addedElementRawCount;
                removedElements.delete(addedNode);

                if (!isParentDisconnected && addedNode.parentNode === parent) {
                    addNodeToAncestorSet(addedElements, addedNode);
                }
            }

            for (const removedNode of mutation.removedNodes) {
                if (removedNode.nodeType !== ELEMENT_NODE) {
                    continue;
                }

                ++removedElementRawCount;
                addedElements.delete(removedNode);

                if (!isParentDisconnected) {
                    // the parent is no longer in the document
                    // we only care about removed nodes that were the top most ancestor of a "batch" of removes
                    removedElements.set(removedNode, parent);
                }

            }
        }
    }

    if (!addedElementRawCount && !removedElementRawCount) {
        return;
    }

    const addedSelectors = new Array(addedElements.size);
    const removedSelectors = new Array(removedElements.size);
    addedSelectors.length = 0;
    removedSelectors.length = 0;

    for (const addedElement of addedElements) {
        addedSelectors.push(getUniqueSelector(addedElement));
    }

    for (const [removedElement, parentElement] of removedElements) {
        const removedSelector = getUniqueSelector(removedElement, {includeAncestors: false});

        if (parentElement.nodeType === DOCUMENT_NODE) {
            removedSelectors.push(removedSelector); // probably "html"
        }
        else if (parentElement.nodeType === ELEMENT_NODE) {
            const parentSelector = getUniqueSelector(parentElement);
            removedSelectors.push(parentSelector + ' > ' + removedSelector);
        }
        else {
            throw Error(`Assertion Error: Unexpected nodeType ${parentElement.nodeType}`);
        }
    }

    const event = runResult.timePointEvent('content:domMutation', startTime, startTime);
    event.shortTitle = 'Mutation';
    event.longTitle = 'DOM Mutation';
    event.setMetaData('addedElementRawCount', addedElementRawCount);
    event.setMetaData('removedElementRawCount', removedElementRawCount);
    event.setMetaData('addedElements', addedSelectors);
    event.setMetaData('removedElements', removedSelectors);
    event.setMetaData('overhead', new TimePoint().diff(startTime));
};


module.exports = {
    observeDocument,
};
