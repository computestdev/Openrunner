'use strict';

const requestBlockingMethods = ({blockingPatterns}) => {
    const addPattern = ({patterns}) => {
        return blockingPatterns.add(patterns);
    };

    const removePattern = ({id}) => {
        return blockingPatterns.remove(id);
    };

    return new Map([
        ['requestBlocking.addPattern', addPattern],
        ['requestBlocking.removePattern', removePattern],
    ]);
};

module.exports = requestBlockingMethods;
