'use strict';
const {describe, it} = require('mocha-sugar-free');
const {assert: {deepEqual: deq}} = require('chai');

const {mergeCoverageCounter, mergeCoverageReports} = require('../../lib/mergeCoverage');

describe('mergeCoverage', () => {
    describe('.mergeCoverageCounter()', () => {
        it('Should merge line counters', () => {
            const to = {
                0: 1,
                1: 5,
                2: 3,
                6: 4,
                7: 5,
                8: 1,
            };
            const from = {
                2: 7,
                3: 1,
                4: 4,
                5: 9,
                6: 2,
                7: 0,
                8: 3,
            };

            mergeCoverageCounter(to, from);

            deq(to, {
                0: 1,
                1: 5,
                2: 10,
                3: 1,
                4: 4,
                5: 9,
                6: 6,
                7: 5,
                8: 4,
            });
        });

        it('Should merge branch counters', () => {
            const to = {
                2: [6, 4],
                3: [4, 8],
                4: [1, 4, 3],
                5: [1],
                6: [4, 2],
            };
            const from = {
                0: [9],
                1: [3, 9],
                2: [12, 10],
                4: [7, 6, 5],
                5: [1, 3],
                6: [4],
            };

            mergeCoverageCounter(to, from);

            deq(to, {
                0: [9],
                1: [3, 9],
                2: [18, 14],
                3: [4, 8],
                4: [8, 10, 8],
                5: [2, 3],
                6: [8, 2],
            });
        });
    });

    describe('.mergeCoverageReports()', () => {
        it('Should merge a report into another and add up the counters', () => {
            const from = {
                '/Users/joris/foo/lib/urlForShortTitle.js': {
                    path: '/Users/joris/foo/lib/urlForShortTitle.js',
                    statementMap: {
                        0: {
                            start: {
                                line: 2,
                                column: 12,
                            },
                            end: {
                                line: 2,
                                column: 28,
                            },
                        },
                        1: {
                            start: {
                                line: 3,
                                column: 34,
                            },
                            end: {
                                line: 3,
                                column: 72,
                            },
                        },
                        2: {
                            start: {
                                line: 5,
                                column: 31,
                            },
                            end: {
                                line: 5,
                                column: 33,
                            },
                        },
                    },
                    fnMap: {
                        0: {
                            name: '(anonymous_0)',
                            decl: {
                                start: {
                                    line: 7,
                                    column: 25,
                                },
                                end: {
                                    line: 7,
                                    column: 26,
                                },
                            },
                            loc: {
                                start: {
                                    line: 7,
                                    column: 38,
                                },
                                end: {
                                    line: 18,
                                    column: 1,
                                },
                            },
                            line: 7,
                        },
                    },
                    branchMap: {
                        0: {
                            loc: {
                                start: {
                                    line: 15,
                                    column: 17,
                                },
                                end: {
                                    line: 15,
                                    column: 77,
                                },
                            },
                            type: 'binary-expr',
                            locations: [
                                {
                                    start: {
                                        line: 15,
                                        column: 17,
                                    },
                                    end: {
                                        line: 15,
                                        column: 70,
                                    },
                                },
                                {
                                    start: {
                                        line: 15,
                                        column: 74,
                                    },
                                    end: {
                                        line: 15,
                                        column: 77,
                                    },
                                },
                            ],
                            line: 15,
                        },
                    },
                    s: {
                        0: 1,
                        1: 4,
                        2: 2,
                    },
                    f: {
                        0: 9,
                    },
                    b: {
                        0: [
                            9,
                            2,
                        ],
                    },
                    _coverageSchema: '332fd63041d2c1bcb487cc26dd0d5f7d97098a6c',
                    hash: 'ff6f7287cd890b244ae907bf55b78484a92fbd13',
                },
                '/Users/joris/foo/lib/foo.js': {
                    path: '/Users/joris/foo/lib/foo.js',
                    statementMap: {},
                    fnMap: {},
                    branchMap: {},
                    s: {
                        0: 5,
                    },
                    f: {
                        0: 2,
                    },
                    b: {
                        0: [
                            2,
                            2,
                        ],
                    },
                    _coverageSchema: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
                    hash: 'f263eb01e255046cc64ce2d1289e02f83edd25cf',
                },
            };
            const to = {
                '/Users/joris/foo/lib/urlForShortTitle.js': {
                    path: '/Users/joris/foo/lib/urlForShortTitle.js',
                    statementMap: {
                        0: {
                            start: {
                                line: 2,
                                column: 12,
                            },
                            end: {
                                line: 2,
                                column: 28,
                            },
                        },
                        1: {
                            start: {
                                line: 3,
                                column: 34,
                            },
                            end: {
                                line: 3,
                                column: 72,
                            },
                        },
                        2: {
                            start: {
                                line: 5,
                                column: 31,
                            },
                            end: {
                                line: 5,
                                column: 33,
                            },
                        },
                    },
                    fnMap: {
                        0: {
                            name: '(anonymous_0)',
                            decl: {
                                start: {
                                    line: 7,
                                    column: 25,
                                },
                                end: {
                                    line: 7,
                                    column: 26,
                                },
                            },
                            loc: {
                                start: {
                                    line: 7,
                                    column: 38,
                                },
                                end: {
                                    line: 18,
                                    column: 1,
                                },
                            },
                            line: 7,
                        },
                    },
                    branchMap: {
                        0: {
                            loc: {
                                start: {
                                    line: 15,
                                    column: 17,
                                },
                                end: {
                                    line: 15,
                                    column: 77,
                                },
                            },
                            type: 'binary-expr',
                            locations: [
                                {
                                    start: {
                                        line: 15,
                                        column: 17,
                                    },
                                    end: {
                                        line: 15,
                                        column: 70,
                                    },
                                },
                                {
                                    start: {
                                        line: 15,
                                        column: 74,
                                    },
                                    end: {
                                        line: 15,
                                        column: 77,
                                    },
                                },
                            ],
                            line: 15,
                        },
                    },
                    s: {
                        0: 100,
                        1: 400,
                        2: 200,
                    },
                    f: {
                        0: 900,
                    },
                    b: {
                        0: [
                            900,
                            200,
                        ],
                    },
                    _coverageSchema: '332fd63041d2c1bcb487cc26dd0d5f7d97098a6c',
                    hash: 'ff6f7287cd890b244ae907bf55b78484a92fbd13',
                },
            };

            mergeCoverageReports(to, from);

            deq(to['/Users/joris/foo/lib/urlForShortTitle.js'].s, {
                0: 101,
                1: 404,
                2: 202,
            });
            deq(to['/Users/joris/foo/lib/urlForShortTitle.js'].f, {
                0: 909,
            });
            deq(to['/Users/joris/foo/lib/urlForShortTitle.js'].b, {
                0: [
                    909,
                    202,
                ],
            });
            deq(to['/Users/joris/foo/lib/foo.js'], {
                path: '/Users/joris/foo/lib/foo.js',
                statementMap: {},
                fnMap: {},
                branchMap: {},
                s: {
                    0: 5,
                },
                f: {
                    0: 2,
                },
                b: {
                    0: [
                        2,
                        2,
                    ],
                },
                _coverageSchema: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
                hash: 'f263eb01e255046cc64ce2d1289e02f83edd25cf',
            });
        });

    });
});
