'use strict';

class MethodRegistrations {
    constructor() {
        this._methods = [];
        Object.freeze(this);
    }

    /**
     * Registers a new method with the given name.
     *
     * If the same method name is registered multiple times, earlier definitions will be overridden
     *
     * @param {string} name The method name
     * @param {Function} func
     */
    register(name, func) {
        if (typeof name !== 'string') {
            throw Error('MethodRegistrations#register(): First argument (name) must be a string');
        }
        if (typeof func !== 'function') {
            throw Error('MethodRegistrations#register(): Second argument (func) must be a function');
        }

        const methods = this._methods;
        const lastDefinition = methods[methods.length - 1];

        if (lastDefinition && lastDefinition.isSingleMethodMap) {
            // reuse the latest definition
            lastDefinition.map.set(name, func);
        }
        else {
            methods.push(Object.freeze({
                isSingleMethodMap: true,
                map: new Map([[name, func]]),
            }));
        }
    }

    /**
     * Registers multiple methods using a Map.
     *
     * Each key->value pair is registered as a method.
     * Values that are not a function are ignored.
     *
     * If the same method name is registered multiple times, earlier definitions will be overridden
     *
     * @param {Map} map
     */
    registerAll(map) {
        if (!map || typeof map.get !== 'function') {
            throw Error('MethodRegistrations#registerAll(): First argument (map) must be a Map');
        }

        const methods = this._methods;
        methods.push(Object.freeze({
            isSingleMethodMap: false,
            map: map,
        }));
    }

    /**
     * Get a previously registered method
     *
     * @param {string} name
     * @return {?Function}
     */
    get(name) {
        if (typeof name !== 'string') {
            throw Error('MethodRegistrations#get(): First argument (name) must be a string');
        }

        const methods = this._methods;
        for (let i = methods.length - 1; i >= 0; --i) {
            const {map} = methods[i];
            const method = map.get(name);

            if (typeof method === 'function') {
                return method;
            }
        }

        return null;
    }

    /**
     * Call a previously registered method
     *
     * @param {string} name The method name
     * @param {...*} args
     * @return {*} The return value of the method
     */
    call(name, ...args) {
        const method = this.get(name);
        if (!method) {
            const err = new Error(`MethodRegistrations.call(): Method "${name}" not found`);
            err.name = 'MethodNotFound';
            throw err;
        }

        return method(...args);
    }
}

module.exports = MethodRegistrations;
