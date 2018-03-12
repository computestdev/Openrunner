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
    //Navigates to the US homepage of skyscanner and waits for elements to be displayed.
    await tab.navigate('https://www.skyscanner.com/?locale=en-US&currency=USD&market=US', {timeout: '10s'});
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('.panelimage').amount(4).isDisplayed();
        await wait.selector('[title="Usabilla Feedback Button"]').isDisplayed();
    });
});

await transaction('EntryFlightDetails', async t => {
    t.title = '01 EntryFlightDetails';
    await tab.wait(async () => {
        // Fills in the required input fields. This transactions contains double CSS selector values because the skyscanner website is an A/B test.
        const destination = await wait.selector('input#js-destination-input, input#destination-fsc-search').isDisplayed();
        await eventSimulation.click(destination);
        await eventSimulation.keyboardTextInput(destination, [...'Mexico City Juarez International (MEX']);
        const suggestion = await wait.selector('.tt-dropdown-menu .tt-dataset-destination, .bpk-autosuggest__suggestion-37QWc.fsc-suggestion-3GqGP, .bpk-autosuggest__suggestion-value-2oNHw')
        await eventSimulation.click(suggestion);
        const travelers = await wait.selector('#js-trad-cabin-class-travellers-toggle, #fsc-class-travellers-trigger-1tkYN');
        await eventSimulation.click(travelers);
        const addAdult = await wait.selector('.increment.adults, .bpk-button-30cpF.bpk-button--secondary-lyMj0');
        await eventSimulation.click(addAdult);
    });
});


await transaction('SearchFlights', async t => {
    t.title = '02 SearchFlights';
    //Clicks on the search button and waits for the results to be displayed.
    await tab.waitForNewPage(async () => {
        const search = await wait.selector('.js-search-button');
        await eventSimulation.click(search);
        const save = await wait.selector('#cs-button-save, .fqs-best-help').isDisplayed();
        await eventSimulation.click(save);
    });
    await tab.wait(async () => {
        //the check below has an extra long timeout because this is a step that can take more time as it searches mutliple sites for the best price.
        await wait.timeout('240s').documentComplete().selectorAll('.day-list-total').containsText('results sorted by').isDisplayed(); 
        await wait.selectorAll('.day-list-item').amount(5, Infinity).isDisplayed();
    });
});
