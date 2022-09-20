'use strict';

const _ = require('lodash');
const joi = require('joi');
const internals = {};

internals.user = function () {

};

/**
 * Creates a joi schema for validating history options against a sequelize model
 * @param model
 * @return {{track: *, idAttr: *, modelName: *, tableName: *, user: *}}
 */
internals.optionsSchema = function (model) {
    return {
        // fields to track - defaults to all fields
        track: joi.array().items(joi.string()).single().default(Object.keys(model.attributes)),

        // the id attribute of the source model
        idAttr: joi.string().default('id'),

        // the history model name (e.g. "OrderHistory")
        modelName: joi.string().default(model.name + 'History'),

        // the history table name (e.g. "order_history")
        tableName: joi.string().default(model.tableName + '_history'),
    };
};

/**
 * builds the sequelize model definition
 * @param model the sequelize model to track
 * @param {{}} options history options
 * @return {Model} the history model
 */
internals.createHistoryModel = function (model, options) {
    const sequelize = model.sequelize;
    const DataTypes = sequelize.Sequelize;

    const idAttr = model.attributes[options.idAttr];

    if (!idAttr) throw new Error('Invalid id attribute for model ' + model.name + ': ' + options.idAttr);

    // attributes about the change, prefixed with _ to limit conflicts
    const metaAttrs = {
        // a rolling unique id because sequelize really wants an id
        _id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

        // the id of the tracked table
        _sourceId: { type: idAttr.type, allowNull: false, unique: 'naturalId' },

        // a rolling revision number per tracked id
        _revision: { type: DataTypes.INTEGER, unique: 'naturalId' },

        // a spot for a username or id. clients must use a pre-create hook to set this attribute
        _user: DataTypes.STRING,

        // timestamp of the change
        _date: DataTypes.DATE,

        // the fields that were changed to trigger the history log
        _changes: DataTypes.ARRAY(DataTypes.STRING)
    };

    // the fields to track
    const attrs = _(model.attributes)
        .pick(options.track)
        .mapValues(attr => _.omit(attr, 'autoIncrement'))
        .merge(metaAttrs)
        .value();

    const instanceMethods = {
        /**
         * restores the tracked item to the current revision
         * @return {*}
         */
        restore: function () {
            const values = _.pick(this, options.track);

            return this.getSource()
                .then(function (source) {
                    return source.update(values);
                });
        }
    };

    const classMethods = {
        sync: function () {
            const tableName = this.tableName;

            function dropInsertTrigger() {
                return sequelize.query(`DROP TRIGGER IF EXISTS insert_${tableName} ON ${tableName}`);
            }

            function createInsertFn() {
                return sequelize.query(`CREATE OR REPLACE FUNCTION insert_${tableName}() RETURNS TRIGGER AS $$ BEGIN NEW._revision := (SELECT coalesce(max(_revision), 0) FROM ${tableName} WHERE "_sourceId" = NEW."_sourceId") + 1; RETURN NEW; END; $$ language plpgsql;`);
            }

            function createInsertTrigger() {
                return sequelize.query(`CREATE TRIGGER insert_${tableName} BEFORE INSERT ON ${tableName} FOR EACH ROW EXECUTE PROCEDURE insert_${tableName}()`);
            }

            return sequelize.Model.prototype.sync.apply(this, arguments)
                .then(createInsertFn)
                .then(dropInsertTrigger)
                .then(createInsertTrigger);
        }
    };

    // sequelize model options
    const modelOpts = {
        tableName: options.tableName,
        instanceMethods: instanceMethods,
        classMethods,
        timestamps: false,
        indexes: [{ fields: ['_sourceId'] }]
    };

    return model.sequelize.define(options.modelName, attrs, modelOpts);
};

/**
 * Associates the history model to the source model
 * @param historyModel
 * @param sourceModel
 * @return {*}
 */
internals.associate = function (historyModel, sourceModel) {
    historyModel.belongsTo(sourceModel, { as: 'source', foreignKey: '_sourceId', onDelete: 'cascade' });
    return historyModel;
};

/**
 * Writes a history entry
 * @param historyModel the history sequelize model
 * @param sourceModel the source sequelize model
 * @param options model options
 * @param instance the sourceModel instance
 * @return {*}
 */
internals.writeHistory = function (historyModel, sourceModel, options, instance) {
    const record = _(instance._previousDataValues)
        .pick(options.track)
        .merge({
            _sourceId: instance[options.idAttr],
            _date: new Date(),
            _changes: instance.changed()
        })
        .value();

    return historyModel.create(record);
};

/**
 * Registers hooks for tracking changes
 * @param historyModel the history sequelize model
 * @param sourceModel the source sequelize model
 * @param options history options
 * @return {*}
 */
internals.addHooks = function (historyModel, sourceModel, options) {
    sourceModel.afterUpdate(function (instance) {
        if (_.intersection(instance.changed(), options.track).length > 0)
            return internals.writeHistory(historyModel, sourceModel, options, instance);
    });

    return historyModel;
};

/**
 * the model plugin function
 * @param options
 * @return {Function}
 */
module.exports = function (options) {
    if (_.isArray(options)) options = { track: options };

    options = _.isPlainObject(options) ? options : { track: [].slice.call(arguments) };

    return function (model) {
        joi.validate(options, internals.optionsSchema(model), function (err, validated) {
            if (err) throw err;
            options = validated;
        });

        return internals.addHooks(internals.associate(internals.createHistoryModel(model, options), model), model, options);
    };
};