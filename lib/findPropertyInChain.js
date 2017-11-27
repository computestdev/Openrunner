'use strict';

const findPropertyInChain = (object, name) => {
    let proto = Object.getPrototypeOf(object);
    while (proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (descriptor) {
            return descriptor;
        }
        proto = Object.getPrototypeOf(proto);
    }
    return null;
};

module.exports = findPropertyInChain;
