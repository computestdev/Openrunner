'use strict';
const sinon = require('sinon');
const {assert: {isTrue, isFalse, strictEqual: eq}} = require('chai');
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');

const cli = require('../../../lib/node/cli');

describe('node/cli', () => {
    let fsMock;

    beforeEach(() => {
        fsMock = sinon.mock(cli._fs);
    });
    afterEach(() => fsMock.verify());

    describe('checkOptionFileAccess()', () => {
        it('Should return true if the file is accessible', async () => {
            fsMock.expects('access').once().withExactArgs('/foo/firefox.exe', 5).returns(Promise.resolve());

            const argv = {firefox: '/foo/firefox.exe', somethingElse: 123};
            const valid = await cli.checkOptionFileAccess(argv, 'firefox', 5);
            isTrue(valid);
        });

        it('Should return false if the file is not accessible', async () => {
            fsMock.expects('access').once().withExactArgs('/foo/firefox.exe', 7)
            .returns(Promise.reject(Error('EPERM: operation not permitted, access \'/foo/firefox.exe\'')));

            const argv = {firefox: '/foo/firefox.exe', somethingElse: 123};
            const valid = await cli.checkOptionFileAccess(argv, 'firefox', 7);
            isFalse(valid);
        });
    });

    describe('checkOptionIsFile()', () => {
        it('Should return true if the path represents a file', async () => {
            const stat = {
                isFile: sinon.stub().returns(true),
            };
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json').returns(Promise.resolve(stat));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsFile(argv, 'result');
            isTrue(valid);
            eq(stat.isFile.callCount, 1);
        });

        it('Should return false if the path is not a file', async () => {
            const stat = {
                isFile: sinon.stub().returns(false),
            };
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json').returns(Promise.resolve(stat));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsFile(argv, 'result');
            isFalse(valid);
            eq(stat.isFile.callCount, 1);
        });

        it('Should return false if the path does not exist', async () => {
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json')
            .returns(Promise.resolve(Error('NOENT: no such file or directory, stat \'/foo/bar.json\'')));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsFile(argv, 'result');
            isFalse(valid);
        });
    });

    describe('checkOptionIsDirectory()', () => {
        it('Should return true if the path represents a directory', async () => {
            const stat = {
                isDirectory: sinon.stub().returns(true),
            };
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json').returns(Promise.resolve(stat));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsDirectory(argv, 'result');
            isTrue(valid);
            eq(stat.isDirectory.callCount, 1);
        });

        it('Should return false if the path is not a directory', async () => {
            const stat = {
                isDirectory: sinon.stub().returns(false),
            };
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json').returns(Promise.resolve(stat));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsDirectory(argv, 'result');
            isFalse(valid);
            eq(stat.isDirectory.callCount, 1);
        });

        it('Should return false if the path does not exist', async () => {
            fsMock.expects('stat').once().withExactArgs('/foo/bar.json')
            .returns(Promise.resolve(Error('NOENT: no such file or directory, stat \'/foo/bar.json\'')));

            const argv = {result: '/foo/bar.json', somethingElse: 123};
            const valid = await cli.checkOptionIsDirectory(argv, 'result');
            isFalse(valid);
        });
    });
});
