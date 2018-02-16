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
    await tab.navigate('https://www.skyscanner.com/?locale=en-US&currency=USD&market=US', {timeout: '10s'});
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('.image.hi-res-image-loaded').amount(3, Infinity).isDisplayed();
        await wait.selector('.timeline__block:nth-child(3)').isDisplayed();
    });
});

await transaction('EntryFlightDetails', async t => {
    t.title = '01 EntryFlightDetails';
    await tab.wait(async () => {
        const destination = await wait.selector('input#js-destination-input').isDisplayed();
        await eventSimulation.keyboardTextInput(destination, [...'Mexico City Juarez International (MEX)']);
        const suggestion = await wait.selector('.tt-dropdown-menu .tt-dataset-destination');
        await eventSimulation.click(suggestion);
        const travelers = await wait.selector('#js-trad-cabin-class-travellers-toggle');
        await eventSimulation.click(travelers);
        const addAdult = await wait.selector('.increment.adults');
        await eventSimulation.click(addAdult);
    });
});

await transaction('SearchFlights', async t => {
    t.title = '02 SearchFlights';
    await tab.waitForNewPage(async () => {
        const search = await wait.selector('.js-search-button');
        await eventSimulation.click(search);
    });
    await tab.wait(async () => {
        await wait.documentComplete()
        await wait.selectorAll('.day-list-total').containsText('results sorted by').isDisplayed(); 
        await wait.documentComplete().selectorAll('.day-list-item').amount(5, Infinity).isDisplayed();
    });
});