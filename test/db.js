'use strict';

const su = require('../lib');
const Sequelize = su.Sequelize;

su.enablePlugins();
su.enableBulkUpsert();
su.enableRequiresTransaction();

/**
 * Postgres 11+ is required
 *
 * prior to running test IF NOT USING 'postgres' user:
 *      - need user <config.user>
 *      - need postgres db 'hapi_sequelize'
 *      - need connect permission configured for user/database on postgres db server
 *
 *      1) at a terminal (ubuntu):
 *              sudo -u postgres createuser -D -A -P <config.user>
 *                      (add <config.password> when prompted)
 *              sudo -u postgres createdb -O <config.user> hapi_sequelize
 *
 *      2) in your pg_hba.conf:
 *              - add entry under local:
 *                  local    hapi_sequelize    <config.user>                                    trust
 *              - add entry under IPv4 local connections:
 *                  host    hapi_sequelize    <config.user>            127.0.0.1/32            trust
 *
 * Otherwise, alter config below for your Postgres server
 */
const config = {
    host: 'localhost',
    port: 5432,
    database: 'hapi_sequelize',
    // password: '',
    user: 'i5'
};

const sequelize = new Sequelize(config.database, config.user, config.password, {
    host: config.host,
    port: config.port,
    logging: false,
    dialect: 'postgres'
});
su.separateHasManyAssociationHook(sequelize);
// required for bulk-upsert-plugin tests
su.ensureDeepJsonbMerge(sequelize);

exports.su = su;
exports.sequelize = sequelize;
exports.config = config;
