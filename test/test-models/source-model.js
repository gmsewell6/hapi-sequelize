'use strict';

module.exports = function (sequelize) {

    const DataTypes = sequelize.Sequelize;

    const attributes = {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        sourceData: DataTypes.STRING,
        name: DataTypes.STRING,
        config: DataTypes.JSONB
    };

    const instanceMethods = {};

    const classMethods = {};

    const options = {
        tableName: 'source_model',
        timestamps: true,
        instanceMethods: instanceMethods,
        classMethods: classMethods,
        associate (models) {
            this.hasMany(models.TargetModel, { as: 'targetModels', foreignKey: 'sourceId', separate: true });
        }
    };

    return sequelize.define('SourceModel', attributes, options);
};