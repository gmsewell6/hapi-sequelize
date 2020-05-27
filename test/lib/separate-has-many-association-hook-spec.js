'use strict';

const $ = require('./common');
const { should, sinon, models } = $;
const { SourceModel, TargetModel } = models;

describe(`separateHasManyAssociationHook`, () => {
    let source, targets, querySpy;

    beforeEach(async () => {
        source = await SourceModel.create({
            sourceData: 'source data 0',
            name: 'Source Number 0',
            config: { foo: 'bar' }
        });
        targets = await TargetModel.bulkCreate([
            { targetData: 'target data 0', name: 'Target Number 0', sourceId: source.id, data: { bar: 'baz' } },
            { targetData: 'target data 1', name: 'Target Number 1', sourceId: source.id, data: { foo: 1 } },
            { targetData: 'target data 2', name: 'Target Number 2', sourceId: source.id, data: { real: false } },
            { targetData: 'target data 3', name: 'Target Number 3', data: { treez: 'fireproof' } }
        ]);
        querySpy = sinon.spy();
    });

    describe(`when an 'include' has no 'separate' config (inherited from association)`, () => {
        it(`should inherit the 'separate' config from the HasMany association automatically and execute N queries`, async () => {
            let result, error;
            try {
                result = await SourceModel.find({
                    where: {
                        id: source.id
                    },
                    include: { association: SourceModel.associations.targetModels, attributes: ['targetData'] },
                    logging: querySpy
                });
            } catch (err) {
                error = err;
            }
            should.not.exist(error);
            should.exist(result);
            querySpy.should.have.been.calledTwice;
        });

        it(`should not break when an included association provides explicit attributes that do not include the association's foreignKey`, async () => {
            let result, error;
            try {
                result = await SourceModel.find({
                    where: {
                        id: source.id
                    },
                    include: { association: SourceModel.associations.targetModels, attributes: ['targetData'] },
                    logging: querySpy
                });
            } catch (err) {
                error = err;
            }
            should.not.exist(error);
            should.exist(result);
            querySpy.should.have.been.calledTwice;
            result.should.have.property('targetModels').that.is.an('Array').that.has.length(3);
            result.targetModels.map(t => t.get()).forEach(t => t.should.have.property('targetData'));
        });
    });

    describe(`when an 'include' explicitly provides 'separate: true'`, () => {
        it(`should not break when an included association provides explicit attributes that do not include the association's foreignKey`, async () => {
            let result, error;
            try {
                result = await SourceModel.find({
                    where: {
                        id: source.id
                    },
                    include: { association: SourceModel.associations.targetModels, attributes: ['targetData'], separate: true },
                    logging: querySpy
                });
            } catch (err) {
                error = err;
            }
            should.not.exist(error);
            should.exist(result);
            querySpy.should.have.been.calledTwice;
            result.should.have.property('targetModels').that.is.an('Array').that.has.length(3);
            result.targetModels.map(t => t.get()).forEach(t => t.should.have.property('targetData'));
        });
    });
});