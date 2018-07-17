/* eslint-disable no-console */
/* eslint-env worker */
'use strict';

onmessage = async e => {
    try {
        const {data} = e;

        const response = await fetch(data.url);
        const body = await response.text();
        postMessage({body});
    }
    catch (err) {
        console.error('Error in Worker script self.onmessage');
    }
};
