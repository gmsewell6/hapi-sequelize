'use strict';

const moniker = require('moniker');
const slugify = require('slug');
const _ = require('lodash');

const internals = {};

/**
 * Creates a slug from either a slugged name + suffix combo or moniker if no name is specified
 * @param {string =} name
 * @return {string}
 */
internals.generateSlug = function (name) {
    return name ? slugify(name).toLowerCase() : moniker.choose();
};

/**
 * Validates that the name attribute, if specified, is defined on the model
 * @param {Object} model the sequelize model
 * @param {string} nameAttr the name attribute
 */
internals.validateNameAttribute = function (model, nameAttr) {
    if (nameAttr && !model.attributes[nameAttr]) throw new Error('Attribute "' + nameAttr + '" not found on on model ' + model.name);
};

/**
 * Validates or creates the slug attribute
 * @param model
 * @param slugAttr
 */
internals.validateOrCreateSlugAttribute = function (model, slugAttr) {
    const DataTypes = model.sequelize.Sequelize;

    if (model.attributes[slugAttr]) {
        if (!model.attributes[slugAttr].type === DataTypes.STRING) throw new Error('Slug attribute "' + slugAttr + '" must be of type string');
    } else {
        model.attributes[slugAttr] = { type: DataTypes.STRING, unique: true };
        model.refreshAttributes();
    }
};

/**
 * A plugin to add boilerplate slug support to an entity
 * @param {string=} nameAttr the attribute to slugify for a default slug value (e.g. 'name'). If specified,
 * the attribute must already exist on the model.
 * @param {string=} [slugAttr=slug] the attribute to store the slug. one will be created if it does not already exist
 * @param {Object} model the sequelize model
 * @return {Function}
 */
internals.slugPlugin = function (nameAttr, slugAttr, model) {
    internals.validateNameAttribute(model, nameAttr);
    internals.validateOrCreateSlugAttribute(model, slugAttr);

    model.hook('beforeValidate', function (instance) {
        instance[slugAttr] = instance[slugAttr] || internals.generateSlug(nameAttr && instance[nameAttr]);
    });

    model.generateSlug = function (name) {
        function uniqueMonikerSlug () {
            const slug = moniker.choose();

            return model.count({
                where: _.set({}, slugAttr, slug)
            })
                .then(function (count) {
                    return count ? uniqueMonikerSlug() : slug;
                });
        }

        function uniqueNameSlug () {
            const slug = internals.generateSlug(name);

            return model.count({
                where: _.set({}, slugAttr, { $like: slug + '%' })
            })
                .then(function (count) {
                    return count ? slug + '-' + (count + 1) : slug;
                });
        }

        return name ? uniqueNameSlug() : uniqueMonikerSlug();
    };
};

module.exports = function (nameAttr, slugAttr) {
    return function (model) {
        return internals.slugPlugin(nameAttr, slugAttr || 'slug', model);
    };
};