'use strict';
const {describe, specify} = require('mocha-sugar-free');

const {runScriptFromFunction, testServerPort} = require('../utilities/integrationTest');

describe.only('integration/chai', {timeout: 60000, slow: 10000}, () => {
    specify('Should expose chai to content', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            await include('assert');
            await include('expect');
            await include('wait');
            const tabs = await include('tabs');
            const tab = await tabs.create();

            await tab.navigate(injected.url, {timeout: '10s'});
            await tab.run(async () => {
                await wait.documentInteractive();
                assert.strictEqual(123, 123);
                assert.match('foo bar baz', /bar/);
                expect(123).to.equal(123);
                expect('foo bar baz').to.match(/bar/);
                document.body.id = 'foo';
                expect(document.body).to.have.id('foo');
                expect({a: 'b', foo: 'bar'}).to.containSubset({a: 'b'});
                expect([1, 2, 3]).to.be.containingAllOf([1]);
            });
        }, {url: `http://localhost:${testServerPort()}/static/static.html`});
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });

    specify('Should expose chai to the script-env', async () => {
        /* eslint-disable no-undef */
        const result = await runScriptFromFunction(async () => {
            'Openrunner-Script: v1';
            const assert = await include('assert');
            const expect = await include('expect');

            assert.strictEqual(123, 123);
            assert.match('foo bar baz', /bar/);
            expect(123).to.equal(123);
            expect('foo bar baz').to.match(/bar/);
            expect({a: 'b', foo: 'bar'}).to.containSubset({a: 'b'});
            expect([1, 2, 3]).to.be.containingAllOf([1]);
        });
        /* eslint-enable no-undef */

        if (result.error) {
            throw result.error;
        }
    });
});
