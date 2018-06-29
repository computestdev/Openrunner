'use strict';
const sinon = require('sinon');

class Wait {
    constructor() {
        this.count = 0;
        this.waits = new Set();
        this.spy = sinon.spy(() => this.advance());
    }

    advance() {
        ++this.count;

        for (const wait of this.waits) {
            if (wait[0] <= this.count) {
                wait[1]();
                this.waits.delete(wait);
            }
        }
    }

    async wait(n) {
        await new Promise(resolve => this.waits.add([this.count + n, resolve]));
    }

    async waitUntil(n) {
        if (n <= this.count) {
            return;
        }
        await new Promise(resolve => this.waits.add([n, resolve]));
    }

    async waitForSideEffect(n, func) {
        const countBefore = this.count;
        const result = await func();
        await this.waitUntil(countBefore + n);
        return result;
    }
}

module.exports = Wait;
