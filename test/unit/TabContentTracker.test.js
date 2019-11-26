'use strict';
const {describe, it, beforeEach} = require('mocha-sugar-free');
const {assert, assert: {strictEqual: eq, deepEqual: deq, throws, notStrictEqual: neq}} = require('chai');
const sinon = require('sinon');
const Promise = require('bluebird');

const PromiseFateTracker = require('../utilities/PromiseFateTracker');
const {TabContentTracker} = require('../../lib/TabContentTracker');

describe('TabContentTracker', () => {
    let tracker;
    beforeEach(() => {
        tracker = new TabContentTracker();
    });

    describe('constructor()', () => {
        it('Should construct properly', () => {
            deq([...tracker.allTabs()], []);
            deq([...tracker.allFrames()], []);
            eq(tracker.tabById(1), null);
            eq(tracker.tabByBrowserId(1), null);
            eq(tracker.frameByBrowserId(1, 2), null);
        });
    });

    describe('tabCreated()', () => {
        it('Should create a new tab properly', () => {
            const tab = tracker.tabCreated(123);

            assert(tab.id && typeof tab.id === 'string');
            eq(tab.browserTabId, 123);
            eq(tab.closed, false);
            deq([...tab.allFrames()], []);
            eq(tab.topFrame, null);
            eq(tracker.tabById(tab.id), tab);
            eq(tracker.tabByBrowserId(123), tab);
            eq(tracker.tabByBrowserId(456), null);
            eq([...tracker.allTabs()].length, 1);
            eq([...tracker.allTabs()][0], tab);
        });
    });

    describe('tabClosed()', () => {
        it('Should close a tab properly', () => {
            const tab = tracker.tabCreated(123);
            tracker.tabClosed(123);

            eq(tab.closed, true);
            eq(tracker.tabById(tab.id), null);
            eq(tracker.tabByBrowserId(123), null);
            eq([...tracker.allTabs()].length, 0);
        });

        it('Should ignore closing of unknown tabs', () => {
            tracker.tabClosed(456);
            eq(tracker.tabByBrowserId(456), null);
        });

        it('Should destroy all frames and content instances', () => {
            const tab = tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [2, 1, 0], 'aaa');
            const contentB = tracker.frameContentHello(123, [1, 0], 'bbb');
            const frame0 = tab.frameByBrowserId(0);
            const frame1 = tab.frameByBrowserId(1);
            const frame2 = tab.frameByBrowserId(2);
            tracker.tabClosed(123);

            eq(contentA.state, 'DESTROYED');
            eq(contentB.state, 'DESTROYED');
            eq(frame0.destroyed, true);
            eq(frame1.destroyed, true);
            eq(frame2.destroyed, true);
            eq([...tracker.allTabs()].length, 0);
            eq([...tab.allFrames()].length, 0);
            eq([...tracker.allFrames()].length, 0);
        });
    });

    describe('frameBeforeNavigate()', () => {
        it('Should throw for unknown tabs', () => {
            throws(() => tracker.frameBeforeNavigate(456, 0), Error, /unknown browserTabId/i);
        });

        it('Should ignore unknown frames', () => {
            const tab = tracker.tabCreated(123);
            tracker.frameBeforeNavigate(123, 0);
            eq(tab.frameByBrowserId(0), null);
        });

        it('Should not destroy the frame', () => {
            const tab = tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], '430x23436g6eeh');
            const frame = tab.frameByBrowserId(0);
            tracker.frameBeforeNavigate(123, 0);
            eq(frame, tab.frameByBrowserId(0));
            eq(frame.destroyed, false);
        });

        it('Should destroy all content instances', () => {
            const tab = tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            const contentB = tracker.frameContentHello(123, [0], 'bbb');
            const frame = tab.frameByBrowserId(0);
            tracker.frameBeforeNavigate(123, 0);
            eq(contentA.state, 'DESTROYED');
            eq(contentB.state, 'DESTROYED');
            eq(frame.initializedContentInstance, null);
            eq(frame.contentInstanceById('aaa'), null);
            eq(frame.contentInstanceById('bbb'), null);
            deq([...tracker._oldContentInstances].sort(), ['aaa', 'bbb']);
        });

        it('Should destroy all exclusive-descendant frames', () => {
            const tab = tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            const contentC = tracker.frameContentHello(123, [200, 100, 0], 'ccc');
            const contentB = tracker.frameContentHello(123, [100, 0], 'bbb');
            const frame0 = tab.topFrame;
            const frame1 = tab.frameByBrowserId(100);
            const frame2 = tab.frameByBrowserId(200);

            tracker.frameBeforeNavigate(123, 0);
            eq(contentA.state, 'DESTROYED');
            eq(contentC.state, 'DESTROYED');
            eq(contentB.state, 'DESTROYED');
            eq(frame0.destroyed, false);
            eq(tab.topFrame, frame0);
            eq(frame1.destroyed, true);
            eq(tab.frameByBrowserId(100), null);
            eq(frame2.destroyed, true);
            eq(tab.frameByBrowserId(200), null);
            deq([...tracker._oldContentInstances].sort(), ['aaa', 'bbb', 'ccc']);
        });

        it('Should cause all affected contentTokens to be blacklisted from future use', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameContentHello(123, [100, 0], 'bbb');

            tracker.frameBeforeNavigate(123, 0);
            throws(() => tracker.frameContentHello(123, [0], 'aaa'), Error, /contentToken.*belonged.*frame.*previously.*destroyed/i);
            throws(() => tracker.frameContentHello(123, [0], 'bbb'), Error, /contentToken.*belonged.*frame.*previously.*destroyed/i);
        });

        it('Should regenerate the currentContentId', () => {
            tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            const frame = contentA.frame;
            eq(frame.browserFrameId, 0);
            const contentId0 = frame.currentContentId;
            assert(contentId0 && typeof contentId0 === 'string');

            tracker.frameBeforeNavigate(123, 0);
            const contentId1 = frame.currentContentId;
            assert(contentId1 && typeof contentId1 === 'string');
            neq(contentId0, contentId1);

            tracker.frameBeforeNavigate(123, 0);
            const contentId2 = frame.currentContentId;
            assert(contentId2 && typeof contentId2 === 'string');
            neq(contentId0, contentId2);
            neq(contentId1, contentId2);
        });

        it('Should destroy content instances in the WAITING_FOR_MAIN state', () => {
            tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            eq(contentA.state, 'WAITING_FOR_MAIN');
            const frame = tracker.frameByBrowserId(123, 0);
            tracker.frameBeforeNavigate(123, 0);
            eq(contentA.state, 'DESTROYED');
            eq(frame.contentInstanceById('aaa'), null);
        });

        it('Should destroy content instances in the WAITING_FOR_INIT_TOKENS state', () => {
            tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameExpectInitialization(123, 0, 'aaa', 'chai');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            eq(contentA.state, 'WAITING_FOR_INIT_TOKENS');
            const frame = tracker.frameByBrowserId(123, 0);
            tracker.frameBeforeNavigate(123, 0);
            eq(contentA.state, 'DESTROYED');
            eq(frame.contentInstanceById('aaa'), null);
        });

        it('Should destroy content instances in the INITIALIZED state', () => {
            tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            eq(contentA.state, 'INITIALIZED');
            const frame = tracker.frameByBrowserId(123, 0);
            tracker.frameBeforeNavigate(123, 0);
            eq(contentA.state, 'DESTROYED');
            eq(frame.contentInstanceById('aaa'), null);
        });
    });

    describe('frameContentHello()', () => {
        it('Should throw for unknown tabs', () => {
            throws(() => tracker.frameContentHello(123, [0], 'aaa'), Error, /unknown.*browserTabId/i);
        });

        it('Should create a new frame', () => {
            const tab = tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [0], 'aaa');
            const {frame} = content;
            eq(frame.tab, tab);
            eq(frame.browserFrameId, 0);
            eq(frame, tab.topFrame);
            eq(frame, tab.frameByBrowserId(0));
            eq(frame, tracker.frameByBrowserId(123, 0));
            eq(frame.initialized, false);
            eq(frame.initializedContentInstance, null);
            eq(frame.initializedContentToken, null);
        });

        it('Should create a content instance and transition it to WAITING_FOR_MAIN', () => {
            tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [0], 'aaa');
            eq(tracker.frameByBrowserId(123, 0).contentInstanceById('aaa'), content);
            eq(content.state, 'WAITING_FOR_MAIN');
            eq(content.contentToken, 'aaa');

        });

        it('Should create all given ancestors', () => {
            const tab = tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [200, 100, 0], 'aaa');
            const {frame} = content;
            eq(frame.browserFrameId, 200);
            eq(frame, tab.frameByBrowserId(200));
            eq(frame, tracker.frameByBrowserId(123, 200));
            eq(frame.tab, tab);
            eq(frame.parentBrowserFrameId, 100);
            eq(frame.isChildOf(frame.parentFrame), true);
            eq(frame.parentFrame.isChildOf(frame), false);
            eq(frame.isChildOf(frame), false);

            eq(frame.parentFrame.tab, tab);
            eq(frame.parentFrame.browserFrameId, 100);
            eq(frame.parentFrame, tab.frameByBrowserId(100));
            eq(frame.parentFrame, tracker.frameByBrowserId(123, 100));
            eq(frame.parentFrame.parentBrowserFrameId, 0);

            eq(frame.parentFrame.parentFrame.tab, tab);
            eq(frame.parentFrame.parentFrame, tab.topFrame);
            eq(frame.parentFrame.parentFrame.browserFrameId, 0);
            eq(frame.parentFrame.parentFrame, tab.frameByBrowserId(0));
            eq(frame.parentFrame.parentFrame, tracker.frameByBrowserId(123, 0));

            eq(frame.parentFrame.parentFrame.parentBrowserFrameId, -1);
            eq(frame.parentFrame.parentFrame.parentFrame, null);

            deq([...tab.allFrames()].map(f => f.browserFrameId), [0, 100, 200]);
            deq([...tracker.allFrames()].map(f => f.browserFrameId), [0, 100, 200]);
        });

        it('Should throw if the descendant frame list is empty', () => {
            tracker.tabCreated(123);
            throws(() => tracker.frameContentHello(123, [], 'aaa', Error, /browserFrameAncestorIds.*empty/));
        });
    });

    describe('frameMainInitializationComplete()', () => {
        it('Should throw for unknown tabs', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            throws(() => tracker.frameMainInitializationComplete(456, 0), Error, /unknown browserTabId/i);
        });

        it('Should throw for unknown frames', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            throws(() => tracker.frameMainInitializationComplete(123, 10), Error, /unknown browserFrameId/i);
        });

        it('Should transition to INITIALIZED if no initTokens are expected', () => {
            tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [0], 'aaa');
            const {frame} = content;
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            eq(content.state, 'INITIALIZED');
            eq(frame.initialized, true);
            eq(frame.initializedContentInstance, content);
            eq(frame.initializedContentToken, 'aaa');
        });

        it('Should set initializedContentInstance to the first initialized instance', () => {
            tracker.tabCreated(123);
            const contentA = tracker.frameContentHello(123, [0], 'aaa');
            const contentB = tracker.frameContentHello(123, [0], 'bbb');
            const contentC = tracker.frameContentHello(123, [0], 'ccc');
            const frame = tracker.frameByBrowserId(123, 0);

            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'ccc');

            eq(contentA.state, 'INITIALIZED');
            eq(contentB.state, 'INITIALIZED');
            eq(contentC.state, 'INITIALIZED');
            eq(frame.initialized, true);
            eq(frame.initializedContentInstance, contentB);
            eq(frame.initializedContentToken, 'bbb');
        });

        it('Should throw if frameContentHello() with the same id\'s was not called before', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [100, 0], 'aaa');
            throws(() => tracker.frameMainInitializationComplete(123, 0, 'aaa'), Error, /unknown.*contentToken/i);
            throws(() => tracker.frameMainInitializationComplete(123, 100, 'bbb'), Error, /unknown.*contentToken/i);
        });

        it('Should transition to WAITING_FOR_INIT_TOKENS if initTokens are expected', () => {
            tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [0], 'aaa');
            const {frame} = content;
            tracker.frameExpectInitialization(123, 0, 'aaa', 'wait');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            eq(content.state, 'WAITING_FOR_INIT_TOKENS');
            eq(frame.initialized, false);
            eq(frame.initializedContentInstance, null);
            eq(frame.initializedContentToken, null);
        });
    });

    describe('frameExpectInitialization()', () => {
        it('Should throw for unknown tabs', () => {
            throws(() => tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*browserTabId/i);
        });

        it('Should throw for unknown frames', () => {
            tracker.tabCreated(123);
            throws(() => tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*browserFrameId/i);
        });

        it('Should throw if called during the wrong state', () => {
            tracker.tabCreated(123);

            tracker.frameContentHello(123, [100, 0], 'aaa');
            throws(() => tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*contentToken/i);

            tracker.frameMainInitializationComplete(123, 100, 'aaa');
            throws(() => tracker.frameExpectInitialization(123, 100, 'aaa', 'eventSimulation'), Error, /invalid.*state.*INITIALIZED/i);
        });
    });

    describe('frameCompleteInitialization()', () => {
        it('Should throw for unknown tabs', () => {
            throws(() => tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*browserTabId/i);
        });

        it('Should throw for unknown frames', () => {
            tracker.tabCreated(123);
            throws(() => tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*browserFrameId/i);
        });

        it('Should throw if called during the wrong state', () => {
            tracker.tabCreated(123);

            tracker.frameContentHello(123, [100, 0], 'aaa');
            throws(() => tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /unknown.*contentToken/i);

            tracker.frameMainInitializationComplete(123, 100, 'aaa');
            throws(() => tracker.frameCompleteInitialization(123, 100, 'aaa', 'eventSimulation'), Error, /invalid.*state.*INITIALIZED/i);
        });

        it('Should throw if the initToken is not expected', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            throws(() => tracker.frameCompleteInitialization(123, 0, 'aaa', 'wait'), Error, /initToken.*not.*pending/i);
        });

        it('Should throw if the initToken has already been completed', () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation');
            tracker.frameExpectInitialization(123, 0, 'aaa', 'httpEvents');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation');
            throws(() => tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation'), Error, /initToken.*not.*pending/i);
        });

        it('Should transition to INITIALIZED if no more initTokens are pending', () => {
            tracker.tabCreated(123);
            const content = tracker.frameContentHello(123, [0], 'aaa');
            eq(content.state, 'WAITING_FOR_MAIN');

            tracker.frameExpectInitialization(123, 0, 'aaa', 'eventSimulation');
            eq(content.state, 'WAITING_FOR_MAIN');

            tracker.frameExpectInitialization(123, 0, 'aaa', 'wait');
            eq(content.state, 'WAITING_FOR_MAIN');

            tracker.frameExpectInitialization(123, 0, 'aaa', 'httpEvents');
            eq(content.state, 'WAITING_FOR_MAIN');

            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            eq(content.state, 'WAITING_FOR_INIT_TOKENS');

            tracker.frameCompleteInitialization(123, 0, 'aaa', 'wait');
            eq(content.state, 'WAITING_FOR_INIT_TOKENS');

            tracker.frameCompleteInitialization(123, 0, 'aaa', 'httpEvents');
            eq(content.state, 'WAITING_FOR_INIT_TOKENS');

            tracker.frameCompleteInitialization(123, 0, 'aaa', 'eventSimulation');
            eq(content.state, 'INITIALIZED');

            const frame = tracker.frameByBrowserId(123, 0);
            eq(frame.initialized, true);
            eq(frame.initializedContentToken, 'aaa');
        });

    });

    describe('whenInitialized()', async () => {
        let callback;
        let callbackResolvers;
        let handleCancels;
        let fate;

        const createCallback = () => {
            const resolvers = [];
            const cancels = [];
            const callback = sinon.spy(({onCancel}) => {
                const handleCancel = sinon.spy();
                cancels.push(handleCancel);
                onCancel(handleCancel);

                return new Promise((resolve, reject) => {
                    resolvers.push({resolve, reject});
                });
            });

            return [resolvers, cancels, callback];
        };

        beforeEach(() => {
            [callbackResolvers, handleCancels, callback]  = createCallback();
            fate = new PromiseFateTracker();
        });

        it('Should call the callback only after initialization', async () => {
            fate.track('first', tracker.whenInitialized(123, 0, callback));

            tracker.tabCreated(123);
            await Promise.delay(10);
            eq(callback.callCount, 0);

            tracker.frameContentHello(123, [0], 'aaa');
            await Promise.delay(10);
            eq(callback.callCount, 0);

            tracker.frameExpectInitialization(123, 0, 'aaa', 'chai');
            await Promise.delay(10);
            eq(callback.callCount, 0);

            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            await Promise.delay(10);
            eq(callback.callCount, 0);

            tracker.frameCompleteInitialization(123, 0, 'aaa', 'chai');
            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(callback.firstCall.args[0].contentInstance.contentToken, 'aaa');
            eq(callback.firstCall.args[0].attempt, 0);
            eq(callback.firstCall.args[0].attemptsLeft, 1);
            eq(handleCancels[0].callCount, 0);

            callbackResolvers[0].resolve({value: 'foo'});
            await fate.waitForAllSettled();
            fate.assertResolved('first', 'foo');
            tracker.frameBeforeNavigate(123, 0);

            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 0);
        });

        it('Should call the callback if already initialized', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 10}));

            await Promise.delay(0);
            eq(callback.callCount, 1);
            eq(callback.firstCall.args[0].contentInstance.contentToken, 'aaa');
            eq(callback.firstCall.args[0].attempt, 0);
            eq(callback.firstCall.args[0].attemptsLeft, 10);
            eq(handleCancels[0].callCount, 0);

            callbackResolvers[0].resolve({value: 'foo'});
            await fate.waitForAllSettled();
            fate.assertResolved('first', 'foo');

            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 0);
        });

        it('Should cancel the callback and try again if the frame navigates away before the callback resolves', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));

            await Promise.delay(0);
            tracker.frameBeforeNavigate(123, 0);
            // The frame is now deinitialized, and a retry is scheduled because there is 1 retry left (retryCount = 2)

            eq(callback.callCount, 1);
            eq(callback.firstCall.args[0].contentInstance.contentToken, 'aaa');
            eq(callback.firstCall.args[0].attempt, 0);
            eq(callback.firstCall.args[0].attemptsLeft, 2);
            eq(handleCancels[0].callCount, 1);
            deq(handleCancels[0].firstCall.args, [false]);

            // The frame was already deinitialized, so this call should have no effect on the retry count:
            tracker.frameBeforeNavigate(123, 0);

            await Promise.delay(10);
            // The frame was already deinitialized, so this call (after a delay) should have no effect on the retry count:
            tracker.frameBeforeNavigate(123, 0);
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 1);

            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            // The frame is now initialized again, and the callback should be attempted again
            await Promise.delay(0);
            eq(callback.callCount, 2);
            eq(callback.secondCall.args[0].contentInstance.contentToken, 'bbb');
            eq(callback.secondCall.args[0].attempt, 1);
            eq(callback.secondCall.args[0].attemptsLeft, 1);

            await Promise.delay(10);
            // The frame is now deinitialized, before the callback could complete. This should immediately result in an retries
            // exhausted error
            tracker.frameBeforeNavigate(123, 0);
            eq(handleCancels[0].callCount, 1);
            eq(handleCancels[1].callCount, 1);
            deq(handleCancels[1].firstCall.args, [true]);

            await fate.waitForAllSettled();
            const err = await fate.assertRejected('first', Error, /Retry attempts have been exhausted/i);
            eq(err.name, 'TabContentTrackerRetriesExhausted');
        });

        it('Should do nothing if the callback already resolved', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 10}));

            await Promise.delay(0);
            callbackResolvers[0].resolve({value: 'foo'});

            await fate.waitForAllSettled();
            fate.assertResolved('first', 'foo');

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);

            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 0);
        });

        it('Should do nothing if the callback already rejected', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 10}));

            await Promise.delay(0);
            callbackResolvers[0].reject(Error('from test case!'));

            await fate.waitForAllSettled();
            fate.assertRejected('first', Error, /from test case!/);

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);

            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 0);
        });

        it('Should retry during the next init if the callback resolves with {retry: true}', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));

            await Promise.delay(0);
            callbackResolvers[0].resolve({retry: true});
            eq(callback.callCount, 1);
            eq(handleCancels[0].callCount, 0);
            await Promise.delay(10);

            // Second frame init
            tracker.frameBeforeNavigate(123, 0);
            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(0);
            eq(callback.callCount, 2);
            eq(callback.secondCall.args[0].contentInstance.contentToken, 'bbb');
            eq(callback.secondCall.args[0].attempt, 1);
            eq(callback.secondCall.args[0].attemptsLeft, 1);

            await Promise.delay(10);
            callbackResolvers[1].resolve({retry: true});
            eq(handleCancels[0].callCount, 0);
            eq(handleCancels[1].callCount, 0);

            tracker.frameBeforeNavigate(123, 0);

            await fate.waitForAllSettled();
            const err = await fate.assertRejected('first', Error, /Retry attempts have been exhausted/i);
            eq(err.name, 'TabContentTrackerRetriesExhausted');
        });

        it('Should ignore the resolved value from the callback if cancelled', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));

            await Promise.delay(0);
            tracker.frameBeforeNavigate(123, 0);
            callbackResolvers[0].resolve({value: 'foo'});

            // Second frame init
            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(0);
            eq(callback.callCount, 2);

            callbackResolvers[1].resolve({value: 'bar'});
            await fate.waitForAllSettled();
            await fate.assertResolved('first', 'bar');
        });

        it('Should resolve with undefined if the callback returns nothing', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));

            await Promise.delay(0);
            callbackResolvers[0].resolve();
            await fate.waitForAllSettled();
            await fate.assertResolved('first', undefined);
        });

        it('Should ignore the rejected error from the callback if cancelled', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));

            await Promise.delay(0);
            tracker.frameBeforeNavigate(123, 0);
            callbackResolvers[0].reject(Error('from test case!'));

            // Second frame init
            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(0);
            eq(callback.callCount, 2);

            callbackResolvers[1].resolve({value: 'bar'});
            await fate.waitForAllSettled();
            await fate.assertResolved('first', 'bar');
        });

        it('Should ignore errors during onCancel handlers', async () => {
            let cancelHandlerThrow = true;
            let secondCallbackResult = new Promise(() => {});
            const secondCallback = sinon.spy(async ({onCancel}) => {
                onCancel(() => {
                    if (cancelHandlerThrow) {
                        throw Error('error from test case!');
                    }
                });
                return secondCallbackResult;
            });

            tracker.tabCreated(123);

            fate.track('first', tracker.whenInitialized(123, 0, secondCallback, {retryCount: 2}));
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');
            await Promise.delay(10);
            eq(secondCallback.callCount, 1);

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);

            cancelHandlerThrow = false;
            secondCallbackResult = {value: 'foo'};

            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');

            await fate.waitForAllSettled();
            fate.assertResolved('first', 'foo');
        });

        it('Should call the proper callback if a frame initializes', async () => {
            const secondCallback = sinon.spy();
            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));
            fate.track('second', tracker.whenInitialized(123, 100, secondCallback, {retryCount: 2}));

            tracker.tabCreated(123);
            tracker.tabCreated(456);
            tracker.frameContentHello(123, [300, 0], 'aaa'); // not waiting for this frame at all
            tracker.frameContentHello(456, [0], 'zzz'); // not waiting for this tab at all
            tracker.frameMainInitializationComplete(123, 300, 'aaa');

            await Promise.delay(10);
            eq(callback.callCount, 0);
            eq(secondCallback.callCount, 0);

            tracker.frameContentHello(123, [0], 'bbb'); // not waiting for this frame at all
            tracker.frameMainInitializationComplete(123, 0, 'bbb');

            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(secondCallback.callCount, 0);

            callbackResolvers[0].resolve({value: 'foo'});
            await fate.waitForSettled('first');
            fate.assertResolved('first', 'foo');
            fate.assertPending('second');
        });

        it('Should cancel the proper callback if a frame deinitializes', async () => {
            const [, secondHandleCancels, secondCallback] = createCallback();

            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));
            fate.track('second', tracker.whenInitialized(123, 100, secondCallback, {retryCount: 2}));

            tracker.tabCreated(123);
            tracker.frameContentHello(123, [100, 0], 'aaa');
            tracker.frameMainInitializationComplete(123, 100, 'aaa');
            tracker.frameContentHello(123, [300, 0], 'bbb');
            tracker.frameMainInitializationComplete(123, 300, 'bbb');
            tracker.frameContentHello(123, [0], 'ccc');
            tracker.frameMainInitializationComplete(123, 0, 'ccc');

            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(secondCallback.callCount, 1);

            tracker.frameBeforeNavigate(123, 300); // not waiting for this frame at all
            await Promise.delay(10);
            eq(handleCancels[0].callCount, 0);
            eq(secondHandleCancels[0].callCount, 0);

            tracker.frameBeforeNavigate(123, 100);
            await Promise.delay(10);
            eq(handleCancels[0].callCount, 0);
            eq(secondHandleCancels[0].callCount, 1);

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);
            eq(handleCancels[0].callCount, 1);
            eq(secondHandleCancels[0].callCount, 1);
        });

        it('Should cancel the proper callback if a parent frame deinitializes', async () => {
            const [, secondHandleCancels, secondCallback] = createCallback();

            fate.track('first', tracker.whenInitialized(123, 0, callback, {retryCount: 2}));
            fate.track('second', tracker.whenInitialized(123, 200, secondCallback, {retryCount: 2}));

            tracker.tabCreated(123);
            tracker.frameContentHello(123, [200, 100, 0], 'aaa');
            tracker.frameMainInitializationComplete(123, 200, 'aaa');
            tracker.frameContentHello(123, [300, 0], 'bbb');
            tracker.frameMainInitializationComplete(123, 300, 'bbb');
            tracker.frameContentHello(123, [0], 'ccc');
            tracker.frameMainInitializationComplete(123, 0, 'ccc');

            await Promise.delay(10);
            eq(callback.callCount, 1);
            eq(secondCallback.callCount, 1);

            tracker.frameBeforeNavigate(123, 300); // not waiting for this frame at all
            await Promise.delay(10);
            eq(handleCancels[0].callCount, 0);
            eq(secondHandleCancels[0].callCount, 0);

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);
            eq(handleCancels[0].callCount, 1);
            eq(secondHandleCancels[0].callCount, 1); // frame 200 is a descendant of frame 0
        });

        it('Should wait for the next initialization, not the current one if the nextInitialization option is set', async () => {
            tracker.tabCreated(123);
            tracker.frameContentHello(123, [0], 'aaa');
            tracker.frameMainInitializationComplete(123, 0, 'aaa');

            fate.track('first', tracker.whenInitialized(123, 0, callback, {nextInitialization: true}));
            eq(callback.callCount, 0);
            await Promise.delay(10);

            tracker.frameBeforeNavigate(123, 0);
            await Promise.delay(10);
            eq(callback.callCount, 0);

            tracker.frameContentHello(123, [0], 'bbb');
            tracker.frameMainInitializationComplete(123, 0, 'bbb');
            await Promise.delay(10);
            eq(callback.callCount, 1);

            callbackResolvers[0].resolve({value: 'foo'});
            await fate.waitForAllSettled();
            fate.assertResolved('first', 'foo');
        });
    });
});
