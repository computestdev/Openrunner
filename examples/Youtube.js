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
    await tab.navigate('https://youtube.com', {timeout: '10s'});
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('#items #thumbnail').amount(30, Infinity).isDisplayed();
    });
});

await transaction('SearchItem', async t => {
    t.title = '01 SearchItem';
    await tab.wait(async () => {
        const searchInput = await wait.selector('input#search').isDisplayed();
        await eventSimulation.keyboardTextInput(searchInput, [...'computest in 1.5 minute']); 
        const search = await wait.selector('#search-icon-legacy');
        await eventSimulation.click(search);
    });
    await tab.wait(async () => {
        await wait.documentComplete().selectorAll('#contents #dismissable').amount(15, Infinity).isDisplayed();
    });
});

await transaction('OpenThirdVideo', async t => {
    t.title = '02 OpenThirdVideo';
    await tab.wait(async () => {
        const video = await wait.selector('ytd-video-renderer:nth-child(1) #video-title');
        await eventSimulation.click(video);
        await wait.selector('video.html5-main-video').isDisplayed().check(video => video.currentTime > 0)
    });

});
await screenshot.take('A screenshot of the youtube video');
await transaction('JumpVideo', async t => {
    t.title = '03 JumpVideo';
     await tab.run(async () => {       
        const skip = await wait.selector('#movie_player').isDisplayed();
        await eventSimulation.keyboardKeys(skip, ['5']);
        await wait.selector('video.html5-main-video').isDisplayed().check(video => {
            const expectedTime = video.seekable.end(0) / 2;
            return video.currentTime >= expectedTime
        });
    });
});

await screenshot.take('A screenshot of the youtube video');
