'use strict';
const padToTwelve = s => ('00000000000' + s).slice(-12);
const padToEight = s => ('0000000' + s).slice(-8);
const padToTwo = s => ('0' + s).slice(-2);
const POW_2_32 = Math.pow(2, 32);
const POW_2_48 = Math.pow(2, 48);

/**
 * @param {number} timestamp See Date.now()
 * @return {Function}
 */
const eventIdGenerator = timestamp => {
    if (typeof timestamp !== 'number') {
        throw Error('timestamp argument must be a number');
    }

    const randomArray = new Uint8Array(6);
    crypto.getRandomValues(randomArray);
    const randomPrefix = [...randomArray].map(n => padToTwo(n.toString(16))).join('');

    const timestampPrefix = padToTwelve(Math.abs(timestamp % POW_2_48).toString(16)); // lasts until the year 10889
    const idPrefix = timestampPrefix + randomPrefix;

    let counter = -1;
    const generateEventId = () => {
        counter = (counter + 1) % POW_2_32;
        return idPrefix + padToEight(counter.toString(16));
    };
    return generateEventId;
};

module.exports = eventIdGenerator;
