'use strict';

const history = require('../../lib/history-plugin');
const chai = require('chai');
const should = chai.should();
const db = require('../db');
const sequelize = db.sequelize;
const DataTypes = sequelize.Sequelize;

chai.use(require('chai-as-promised'));

describe('history-plugin', function () {
    let Order, OrderHistory;

    beforeEach(function () {
        Order = sequelize
            .define('Order', {
                product: DataTypes.STRING,
                amount: DataTypes.DOUBLE,
                customer: DataTypes.STRING,
                untracked: DataTypes.STRING
            }, { tableName: 'order' })
            .plugin(history('product', 'amount', 'customer'));

        OrderHistory = sequelize.models.OrderHistory;

        return sequelize.sync({ force: true });
    });

    it('should exist', function () {
        should.exist(history);
    });

    it('should be a function', function () {
        history.should.be.a('function');
    });

    it('should return a model plugin function', function () {
        history().should.be.a('function').that.has.length(1);
    });

    it('should define a history model', function () {
        sequelize.models.should.have.property('OrderHistory');
    });

    it('should have an _id attribute', function () {
        OrderHistory.attributes.should.have.property('_id');
    });

    it('should have a _user attribute', function () {
        OrderHistory.attributes.should.have.property('_user');
    });

    it('should have a _date attribute', function () {
        OrderHistory.attributes.should.have.property('_date');
    });

    it('should have a _changes attribute', function () {
        OrderHistory.attributes.should.have.property('_changes');
    });

    it('should have a revision attribute', function () {
        OrderHistory.attributes.should.have.property('_revision');
    });

    it('should ignore untracked fields', function () {
        OrderHistory.attributes.should.not.have.property('untracked');
    });

    it('should index the _sourceId property', function () {
        OrderHistory.options.indexes.should.have.length(1);
        OrderHistory.options.indexes[0].should.have.property('fields').that.has.members(['_sourceId']);
    });

    it('should include an association to the tracked model', function () {
        OrderHistory.associations.should.have.property('source');
    });

    describe('when the tracked model has been inserted', function () {
        let order;

        beforeEach(function () {
            return Order.create({ product: 'SEMtek', customer: 'Bert Leupen', amount: 200.00 })
                .then(function (value) {
                    order = value;
                });
        });

        it('should not update the history', function () {
            return OrderHistory.count().should.eventually.equal(0);
        });

        describe('when a tracked field is updated', function () {
            beforeEach(function () {
                return order.update({ amount: 300.00 });
            });

            it('should update the history with the previous values', function () {
                return OrderHistory.findAll()
                    .then(function (history) {
                        history.should.have.length(1);
                        history[0].should.have.property('_id', order.id);
                        history[0].should.have.property('_date');
                        history[0].should.have.property('_revision', 1);
                        history[0].should.have.property('product', order.product);
                        history[0].should.have.property('customer', order.customer);
                        history[0].should.have.property('amount', 200);
                    });
            });

            it('should support reverting the target model to a specific history instance', function () {
                return OrderHistory.find()
                    .then(function (history) {
                        history.should.respondTo('restore');
                        return history.restore();
                    })
                    .then(function (order) {
                        order.amount.should.equal(200);
                        return OrderHistory.count();
                    })
                    .then(function (count) {
                        count.should.equal(2);
                    });
            });

            describe('and the history table has been partially cleared', function () {
                beforeEach(function () {
                    return order.update({ amount: 400.00 });
                });

                beforeEach(function () {
                    return OrderHistory.destroy({ where: { _revision: 1 } });
                });

                it('should pick the next revision number', function () {
                    return order.update({ amount: 500.00 })
                        .then(function () {
                            return OrderHistory.max('_revision').should.eventually.equal(3);
                        });
                });
            });
        });

        describe('when an untracked field is updated', function () {
            beforeEach(function () {
                return order.update({ untracked: 'foo' });
            });

            it('should not update the history table', function () {
                return OrderHistory.count().should.eventually.equal(0);
            });
        });

        describe('when no fields are changed but the entity is saved', function () {
            beforeEach(function () {
                return order.save();
            });

            it('should not update the history table', function () {
                return OrderHistory.count().should.eventually.equal(0);
            });
        });

        describe('when the tracked item has been deleted', function () {
            beforeEach(function () {
                return order.destroy();
            });

            it('should remove the history records', function () {
                return OrderHistory.count().should.eventually.equal(0);
            });
        });
    });
});