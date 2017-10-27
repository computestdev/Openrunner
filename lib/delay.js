'use strict';

const delay = async ms => {
    await new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = delay;
