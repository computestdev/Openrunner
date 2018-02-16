'Openrunner-Script: v1';
const expect = await include('expect');
const tabs = await include('tabs');
await include('contentEvents');
await include('httpEvents');
await include('wait');
await include('eventSimulation');
const screenshot = await include('screenshot');
const requestBlocking = await include('requestBlocking');
const tab = await tabs.create();

await requestBlocking.block([
    '*://*.google-analytics.com/*',
]);

await transaction('HomePage', async t => {
    t.title = '00 HomePage';
    await tab.navigate('https://www.hostelworld.com/', {timeout: '10s'});
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('.small-12.medium-6').amount(15, Infinity).isDisplayed();
    });
});

await transaction('EnterDetails', async t => {
    t.title = '01 EnterDetails';
    await tab.run(async () => {
        const searchInput = await wait.selector('input#home-search-keywords').isDisplayed();
        await eventSimulation.keyboardTextInput(searchInput, [...'lima, Peru']); 
        const suggestion = await wait.selector('.suggestion.needsclick');
        await eventSimulation.click(suggestion);
    });
});

await transaction('Search', async t => {
    t.title = '02 Search';
    await tab.waitForNewPage(async () => {
        const go = await wait.selector('.orange_button');
        await eventSimulation.click(go);
    });
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('#fabResultsContainer .fabresult').amount(15, Infinity).isDisplayed();
    });
});

await transaction('OpenItem', async t => {
    t.title = '03 OpenItem';
    await tab.waitForNewPage(async () => {
        const firstItem = await wait.selector('#fabResultsContainer .fabresult .moreinfo');
        await eventSimulation.click(firstItem);
    });
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('.carousel img').amount(20, Infinity).isDisplayed();
        await wait.selectorAll('.small-12.columns a.button').containsText('View all').isDisplayed();
    });
});

await transaction('ChooseRoomDetails', async t => {
    t.title = '04 ChooseRoom';
    await tab.run(async () => {
        const room = document.querySelector('.guests.hwta-room-select')
        room.selectedIndex = 1;
        room.dispatchEvent(new UIEvent('change', {bubbles: true}));
        const booking = await wait.selector('.totalsummary.clearfix .clearfix:nth-child(4) i');
        await eventSimulation.click(booking);
    });
});

await transaction('BookNow', async t => {
    t.title = '05 BookNow';
    await tab.waitForNewPage(async () => {
        const book = await wait.selector('#bookNowButton');
        await eventSimulation.click(book);
    });
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('.greybox input').amount(5, Infinity).isDisplayed();
        await wait.selectorAll('#bookNow').isDisplayed();
    });
});
