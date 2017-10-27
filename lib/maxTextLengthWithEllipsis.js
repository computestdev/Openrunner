'use strict';
const HORIZONTAL_ELLIPSIS = '\u2026';

const maxTextLengthWithEllipsis = (string, maxLength) => {
    return string.length <= maxLength
        ? string
        : string.slice(0, maxLength - 1) + HORIZONTAL_ELLIPSIS;
};

module.exports = maxTextLengthWithEllipsis;
