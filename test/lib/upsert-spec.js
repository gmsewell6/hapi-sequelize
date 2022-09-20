'use strict';

const common = require('./common');
const { UpsertModel, MultipartUpsertModel } = common.models;

describe('native upsert plugin', function () {
    describe('for a single part unique constraint', function () {
        describe('when no record exists', function () {
            it('should insert', async function () {
                let instance = await UpsertModel.pgUpsert(
                    {
                        naturalId: 'foo',
                        name: 'Foo',
                        deepMerge: {
                            current: {
                                one: true
                            }
                        },
                        overwrite: {
                            current: {
                                one: true
                            }
                        }
                    });
                instance.get().should.deep.equal(
                    {
                        id: 1,
                        naturalId: 'foo',
                        name: 'Foo',
                        deepMerge: {
                            current: {
                                one: true
                            }
                        },
                        overwrite: {
                            current: {
                                one: true
                            }
                        }
                    });
            });
        });

        describe('when a record exists', function () {
            beforeEach(() => UpsertModel.create(
                {
                    id: 1,
                    naturalId: 'foo',
                    name: 'Foo',
                    deepMerge: {
                        current: {
                            one: true
                        }
                    },
                    overwrite: {
                        current: {
                            one: true
                        }
                    }
                }));

            it('should update', async function () {
                const instance = await UpsertModel.pgUpsert(
                    {
                        naturalId: 'foo',
                        name: 'Bar',
                        deepMerge: {
                            old: {
                                one: false
                            }
                        },
                        overwrite: {
                            old: {
                                one: false
                            }
                        }
                    });
                instance.get().should.deep.equal(
                    {
                        id: 1,
                        naturalId: 'foo',
                        name: 'Bar',
                        deepMerge: {
                            current: {
                                one: true
                            },
                            old: {
                                one: false
                            }
                        },
                        overwrite: {
                            old: {
                                one: false
                            }
                        }
                    });
            });
        });
    });

    describe('for multi part unique constraint', function () {
        describe('when no record exists', function () {
            it('should insert', async function () {
                let instance = await MultipartUpsertModel.pgUpsert({
                    naturalId1: 'foo',
                    naturalId2: 'bar',
                    name: 'FooBar',
                    deepMerge: {
                        current: {
                            one: true
                        }
                    },
                    overwrite: {
                        current: {
                            one: true
                        }
                    }
                });
                instance.get().should.deep.equal(
                    {
                        id: 1,
                        naturalId1: 'foo',
                        naturalId2: 'bar',
                        name: 'FooBar',
                        deepMerge: {
                            current: {
                                one: true
                            }
                        },
                        overwrite: {
                            current: {
                                one: true
                            }
                        }
                    });
            });
        });

        describe('when a record exists', function () {
            beforeEach(() => MultipartUpsertModel.create(
                {
                    naturalId1: 'foo',
                    naturalId2: 'bar',
                    name: 'FooBar',
                    deepMerge: {
                        current: {
                            one: true
                        }
                    },
                    overwrite: {
                        current: {
                            one: true
                        }
                    }
                }));

            it('should update', async function () {
                const instance = await MultipartUpsertModel.pgUpsert(
                    {
                        naturalId1: 'foo',
                        naturalId2: 'bar',
                        name: 'BarBaz',
                        deepMerge: {
                            old: {
                                one: false
                            }
                        },
                        overwrite: {
                            old: {
                                one: false
                            }
                        }
                    });
                instance.get().should.deep.equal(
                    {
                        id: 1,
                        naturalId1: 'foo',
                        naturalId2: 'bar',
                        name: 'BarBaz',
                        deepMerge: {
                            current: {
                                one: true
                            },
                            old: {
                                one: false
                            }
                        },
                        overwrite: {
                            old: {
                                one: false
                            }
                        }
                    });
            });
        });
    });
});