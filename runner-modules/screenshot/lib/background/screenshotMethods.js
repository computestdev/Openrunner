'use strict';
const takeScreenshot = require('./takeScreenshot');

module.exports = ({browserTabs, runResultModule, tabsModule}) => {
    const take = async ({comment}) => {
        await takeScreenshot({
            browserTabs,
            comment,
            runResultModule,
            tabsModule,
        });
    };

    return new Map([
        ['screenshot.take', take],
    ]);
};
