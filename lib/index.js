'use strict';

const _ = require('lodash');
const boom = require('boom');
const joi = require('joi');
const Sequelize = require('@entrinsik/informer-sequelize');
const lookupHandler = require('./lookup-handler');
const queryHandler = require('./query-handler');
const removeHandler = require('./remove-handler');
const updateHandler = require('./update-handler');
const retryAsPromised = require('retry-as-promised');

const ADVISORY_LOCK = 314159265;

exports.associate = function associate (sequelize) {
    _.forEach(sequelize.models, function (model) {
        if ('associate' in model.options) {
            model.options.associate.call(model, sequelize.models);
        }
    });
};

exports.enablePlugins = function () {
    Sequelize.Model.prototype.plugin = function (plugin) {
        plugin(this);
        return this;
    };
};

exports.bulkUpsert = require('./bulk-upsert-plugin');

exports.enableBulkUpsert = function () {
    _.assign(Sequelize.Model.prototype, exports.bulkUpsert.plugin);
};

Sequelize.prototype.setDefaultRole = function (defaultRole) {
    this._defaultRole = _.isFunction(defaultRole) ? defaultRole : () => defaultRole;
};

Sequelize.prototype.enableQueryRoles = function () {
    const getRole = ({ role = this._defaultRole() }) => role;

    const setRole = (client, role) => role ? client.query(`SET ROLE "${role}"`) : client.query('RESET ROLE');

    const connectionManager = this.connectionManager;
    const _connect = connectionManager.getConnection;
    connectionManager.getConnection = function (opts, ...args) {
        return _connect.apply(connectionManager, [opts].concat(args))
            .then(async client => {
                try {
                    await setRole(client, getRole(opts));
                    return client;
                } catch (err) {
                    this.sequelize.log(err.message);
                    this.sequelize.log('Invalid role for query, rejecting request');
                    this.releaseConnection(client);
                    throw boom.unauthorized();
                }
            });
    };

    Sequelize.prototype.setDefaultRole = function (defaultRole) {
        this._defaultRole = _.isFunction(defaultRole) ? defaultRole : () => defaultRole;
    };

    this.setDefaultRole(false);
};

Sequelize.prototype.patchUpsert = function () {
    return require('./upsert-plugin')(this);
};

/**
 * Adds role switching support to sequelize. Once enabled,
 * @param sequelize
 */
exports.enableQueryRole = function (/* sequelize */) {
};

exports.hasHooks = function (newInstance) {
    return function (Model) {
        Model.Instance.prototype.hooks = function hooks () {
            this._hooks = this._hooks || newInstance().curry(this);
            return this._hooks;
        };

        Model.Instance.prototype.runHook = function runHook (/* event */) {
            return this.hooks().runHook.apply(this._hooks, arguments);
        };

        Model.Instance.prototype.on = function on (event, listener) {
            return this.hooks().on(event, listener);
        };
    };
};

exports.slug = require('./slug-plugin');

exports.history = require('./history-plugin');

/**
 *
 * @param sequelize
 * @param fn
 * @return {*}
 */
exports.requiresTransaction = function (sequelize, fn) {
    const t = Sequelize.cls && Sequelize.cls.get('transaction');
    const P = Sequelize.Promise;

    // make sure not to throw synchronous errors
    if (t) return P.try(() => fn(t));

    return sequelize.transaction(fn);
};

exports.sideEffectFreeTransaction = function (sequelize, fn, opts = {
    max: 3,
    match: 'could not serialize access due to concurrent update'
}) {
    return retryAsPromised(() => {
        return sequelize.transaction(fn);
    }, opts);
};

exports.enableRequiresTransaction = function () {
    Sequelize.prototype.requiresTransaction = function (fn) {
        return exports.requiresTransaction(this, fn);
    };
};

exports.enableSideEffectFreeTransaction = function () {
    Sequelize.prototype.sideEffectFreeTransaction = function (fn, opts) {
        return exports.sideEffectFreeTransaction(this, fn, opts);
    };
};

exports.restoreDefaultsPlugin = require('./restore-defaults-plugin');

exports.enableLobSupport = function () {
    _.assign(Sequelize.prototype, require('./lob-plugin'));
};

exports.tableLog = require('./etag-plugin');

exports.afterCreateDatabase = function (sequelize) {
    return exports.ensureDeepJsonbMerge(sequelize);
};

exports.ensureDeepJsonbMerge = function (sequelize) {
    return sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async t => {
        await sequelize.query(
            `
            SELECT pg_advisory_xact_lock(${ADVISORY_LOCK});
            
            CREATE OR REPLACE FUNCTION jsonb_deep_merge(original jsonb, current jsonb)
            RETURNS JSONB LANGUAGE SQL AS $$
                SELECT
                jsonb_object_agg(
                    coalesce(oKey, cKey),
                    case
                        WHEN oValue isnull THEN cValue
                        WHEN cValue isnull THEN oValue
                        WHEN jsonb_typeof(oValue) <> 'object' or jsonb_typeof(cValue) <> 'object' THEN cValue
                        ELSE jsonb_deep_merge(oValue, cValue) END
                    )
                FROM jsonb_each(original) e1(oKey, oValue)
                FULL JOIN jsonb_each(current) e2(cKey, cValue) ON oKey = cKey
            $$;
        `, { transaction: t });
    });
};

/**
 * Add global 'beforeFindAfterExpandIncludeAll' sequelize hook to bubble up existing 'separate' configs on
 * included HasMany associations and default to 'separate:true' when not explicitly configured on the associations
 * or on the include entry.
 *
 * Occurs
 *  - after scopes are injected
 *  -
 * Must occur before 'separate' includes are processed so PK attributes from separate includes get added properly
 * during Model.$validateIncludedElements.
 *
 * This works around the sequelize issue where 'separate' config from a HasMany association is not automatically
 * defaulted into an include entry of a Model.find() call; the 'separate' config is only honored
 * when it is explicitly provided to the specific includes entry.
 *
 * This also works around a sequelize issue where sequelize can break outright if 'separate' option and an explicit
 * attributes collection are provided for an included HasMany but the foreignKey of the association is not one of them.
 * This particular issue was fixed in sequelize by https://github.com/sequelize/sequelize/pull/9396 and published
 * in 5.0.0-beta.5 and generally available in sequelize@>=5.1.0
 *
 * @param sequelize a sequelize instance
 */
exports.separateHasManyAssociationHook = function (sequelize) {
    // add global 'beforeFindAfterExpandIncludeAll' sequelize hook to bubble up existing 'separate' config on
    // included HasMany associations and default to 'separate:true' if not explicitly configured on the included HasMany associations
    // and also add the foreignKey attributes of the included HasMany association if not provided already.
    // Must occur before 'separate' includes are processed so PK attributes from separate includes get added properly
    // during Model.$validateIncludedElements
    const HasMany = sequelize.Association.HasMany;
    sequelize.addHook('beforeFindAfterExpandIncludeAll', function separateHasMany (opts) {
        const makeIncludeObject = hasManyAssoc => ({
            association: hasManyAssoc,
            separate: _.get(hasManyAssoc, ['options', 'separate'])
        });

        const processIncludes = includes => _.map(includes, processInclude);
        const processInclude = include => {
            if (!include) return include;
            // convert direct HasMany association reference to include object structure, carrying over 'separate' config from the association or default to true
            if (include instanceof HasMany) return makeIncludeObject(include);

            if (include.association instanceof HasMany) {
                // default in 'separate' config from HasMany association if 'separate' option not explicitly provided
                if (!include.hasOwnProperty('separate')) {
                    include.separate = _.get(include.association, ['options', 'separate']);
                }
                // ensure 'separate' HasMany association foreignKey is in include.attributes, when attributes are explicitly provided. Otherwise, error happens in Model.$findSeparate() -> HasMany.get() when merging results @ ~331
                if (include.separate && _.get(include, ['attributes', 'length']) && !_.includes(_.flattenDeep(include.attributes), include.association.foreignKey)) {
                    include.attributes.push(include.association.foreignKey);
                }
            } else if (!include.association && _.get(include.model, ['scoped']) && include.model.$scope) {
                // otherwise when no association is provided but the include references scoped model, process scoped model includes
                include.model.$scope = separateHasMany(include.model.$scope);
            }
            // process direct child includes
            if (_.get(include, ['include', 'length'])) {
                include.include = processIncludes(include.include);
            }

            if (include.separate && include.association) {
                sequelize.log(`Separated HasMany - ${include.association.as}`);
            }
            return include;
        };

        if (opts.include) {
            opts.include = processIncludes(opts.include);
        }
        return opts;
    });
};

exports.register = async function (server, opts, next) {
    let sequelize, models;
    const schema = {
        database: joi.string().required(),
        user: joi.string().required(),
        password: joi.string().default(''),
        options: joi.object().keys({
            dialect: joi.string().default('postgres'),
            host: joi.string(),
            port: joi.number().integer(),
            sync: joi.any(),
            pool: joi.object(),
            timezone: joi.string().default('+00:00'),
            replication: joi.alternatives([joi.boolean(), joi.object()]),
            dialectOptions: joi.object(),
            logging: joi.alternatives([joi.boolean(), joi.func()])
                .default(_.constant(server.log.bind(server, ['db', 'debug'])), 'default logger')
        }).default({ dialect: 'postgres' }),
        namespace: joi.string().optional(),
        appVar: joi.string().default('db'),
        auth: joi.any().default(false),
        transaction: {
            isolationLevel: 'READ_COMMITTED' // READ_COMMITTED, REPEATABLE_READ, OR SELIAZABLE
        },
        queryHandler: {
            limit: joi.number().integer().default(30)
        },
        sync: joi.boolean().default(false)
    };

    joi.validate(opts, schema, function (err, validated) {
        if (err) return next(err);

        opts = validated;
    });

    if (opts.namespace && process.namespaces && process.namespaces[opts.namespace]) {
        server.ext('onPreStart', function (server, next) {
            Sequelize.cls = process.namespaces[opts.namespace];
            next();
        });
    }

    // turn on plugin support
    exports.enablePlugins();

    // turn on bulk upsert
    exports.enableBulkUpsert();

    // adds requiresTransaction() method to sequelize
    exports.enableRequiresTransaction();

    exports.enableSideEffectFreeTransaction();

    // turn on lobs
    exports.enableLobSupport();

    sequelize = new Sequelize(opts.database,
        opts.user,
        opts.password,
        opts.options);

    // add finder hook to propagate 'separate' config on HasMany associations
    exports.separateHasManyAssociationHook(sequelize);

    models = sequelize.models;

    // turn on query roles
    sequelize.enableQueryRoles();

    const api = server.app[opts.appVar] = {
        models: models,
        model: function (modelName) {
            if (!models.hasOwnProperty(modelName)) throw new Error('No such model: ' + modelName);

            return models[modelName];
        },
        sequelize: sequelize,
        define: function (defineFn, ...opts) {
            return defineFn(sequelize, ...opts);
        },
        query: sequelize.query.bind(sequelize),
        afterCreateDatabase: exports.afterCreateDatabase
    };

    server.expose(api);
    server.ext('onPreStart', function (server, done) {
        server.log(['ent-sequelize', 'log'], 'Associating models');
        exports.associate(sequelize);
        sequelize.patchUpsert();

        if (opts.sync) {
            server.log(['ent-sequelize', 'log'], 'Syncing database schema...');
            return sequelize.sync().nodeify(done);
        } else {
            done();
        }
    });

    server.ext('onPreHandler', function (req, reply) {
        const seqConfig = req.route.settings.plugins.sequelize;
        if (seqConfig && seqConfig.transaction) {
            //joi.assert(seqConfig.transaction, {
            //    isolationLevel: [joi.boolean(), joi.string().valid(['READ_COMMITTED', 'REPEATABLE_READ', 'SERIALIZABLE'])]
            //});
            //
            //const transactionOpts = _.isBoolean(seqConfig.transaction) ? opts.transaction : seqConfig.transaction;

            req.log(['sequelize', 'debug'], 'Starting transaction');

            sequelize.transaction()
                .then(function (t) {
                    req.plugins.sequelize = req.plugins.sequelize || {};
                    req.plugins.sequelize.transaction = t;
                    reply.continue();
                })
                .catch(reply);
        } else {
            reply.continue();
        }
    });

    server.ext('onPostHandler', function (req, reply) {
        const t = req.plugins.sequelize && req.plugins.sequelize.transaction;

        if (!t || t.finished) return reply.continue();

        if (req.response instanceof Error) {
            req.log(['sequelize', 'info'], 'Rolling back transaction');
            t.rollback().then(() => reply.continue());
        } else {
            req.log(['sequelize', 'info'], 'Committing transaction');
            t.commit().then(() => reply.continue());
        }
    });

    server.ext('onPostHandler', function (req, reply) {
        if (req.response instanceof sequelize.ValidationError) {
            const error = boom.badRequest(req.response);
            error.output.payload.validation = req.response.errors;
            return reply(error);
        }
        reply.continue();
    });

    server.decorate('request', 'model', api.model);
    server.handler('db.query', queryHandler(sequelize, opts.queryHandler));
    server.handler('db.lookup', lookupHandler(sequelize));
    server.handler('db.remove', removeHandler(sequelize, opts.deleteHandler));
    server.handler('db.update', updateHandler(sequelize));
    server.handler('db.upsert', function (route, options) {
        return updateHandler(sequelize, route, _.assign(options, { create: true }));
    });

    // ensure jsonb_deep_merge function exists (required for onConflict attribute option in bulkUpsert + upsert plugins)
    return next();
};

exports.Sequelize = Sequelize;

exports.register.attributes = { pkg: require('../package.json') };