'use strict';
module.exports = async ({browserRuntime}) => {
    const manifest = browserRuntime.getManifest();
    const [platformInfo, browserInfo] = await Promise.all([
        browserRuntime.getPlatformInfo(),
        browserRuntime.getBrowserInfo(),
    ]);

    return {
        runnerName: manifest.name,
        runnerVersion: manifest.version,
        platformOs: platformInfo.os,
        browserName: browserInfo.name,
        browserVendor: browserInfo.vendor,
        browserVersion: browserInfo.version,
        browserBuild: browserInfo.buildID,
    };
};
