'use strict';
const fs = require('fs-extra');

const log = require('../logger')({MODULE: 'node/hardlinkCopy'});

/**
 * Recursively copy a directory. Files are hard linked.
 * If the source and destination span filesystems, a regular copy will be used instead.
 */
const hardLinkCopy = async (src, dest, opts = {}) => {
    const MAX_ATTEMPTS = 3;
    let linkErrors = 0;

    await fs.copy(src, dest, {
        ...opts,
        filter: async (src, dest) => {
            // return true = default fs-extra behaviour

            if (linkErrors >= MAX_ATTEMPTS) {
                return true;
            }

            const stat = opts.dereference ? fs.stat : fs.lstat;
            const srcStat = await stat(src);

            if (srcStat.isFile()) {
                // regular file, attempt to hard link and fallback to a regular
                // copy (by letting fs-extra handle it) if it fails
                try {
                    await fs.link(src, dest);
                    return false;
                }
                catch (err) {
                    ++linkErrors;
                    log.warn({err, giveUp: linkErrors >= MAX_ATTEMPTS}, 'Hardlink failed, falling back to regular copy');
                    return true;
                }
            }

            // directories, symlinks, etc,
            return true;
        },
    });
};

module.exports = hardLinkCopy;
