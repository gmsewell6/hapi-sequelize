'use strict';

module.exports = function (sequelize) {

    const DataTypes = sequelize.Sequelize;

    const attributes = {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        targetData: DataTypes.STRING,
        name: DataTypes.STRING,
        data: DataTypes.JSONB
    };

    const instanceMethods = {};

    const classMethods = {};

    const options = {
        tableName: 'target_model',
        timestamps: true,
        instanceMethods: instanceMethods,
        classMethods: classMethods
    };

    return sequelize.define('TargetModel', attributes, options);
};