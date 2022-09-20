'use strict';

const slugs = require('../../lib/slug-plugin');
const chai = require('chai');
const should = chai.should();
const db = require('../db');
const sequelize = db.sequelize;
const DataTypes = sequelize.Sequelize;

describe('slug-plugin', function () {
    it('should exist', function () {
        should.exist(slugs);
    });

    it('should be a function', function () {
        slugs.should.be.a('function');
    });

    describe('when an entity has basic slug support', function () {
        let Datasource;

        beforeEach(function () {
            Datasource = sequelize.define('Datasource', {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                name: DataTypes.STRING
            }, { tableName: 'datasource' });

            Datasource.plugin(slugs());
        });

        beforeEach(function () {
            return sequelize.sync({ force: true });
        });

        it('should add a slug field', function () {
            return Datasource.create()
                .then(function (datasource) {
                    datasource.should.have.property('slug');
                });
        });

        describe('generateSlug()', function () {
            it('should add a static slug() method to the model', function () {
                Datasource.should.respondTo('generateSlug');
            });

            it('should generate a unique moniker slug', function () {
                return Datasource.generateSlug()
                    .then(function (slug) {
                        should.exist(slug);
                    });
            });

            it('should generate a slug from a name', function () {
                return Datasource.generateSlug('World Demo')
                    .then(function (slug) {
                        slug.should.equal('world-demo');
                    });
            });

            describe('when an entity with the slug exists already', function () {
                beforeEach(function () {
                    return Datasource.create({ name: 'World Demo', slug: 'world-demo' });
                });

                it('should append a suffix', function () {
                    return Datasource.generateSlug('World Demo')
                        .then(function (slug) {
                            slug.should.equal('world-demo-2');
                        });
                });
            });
        });
    });

    describe('when an entity has a slug based on another field', function () {
        let Datasource;

        beforeEach(function () {
            Datasource = sequelize.define('Datasource', {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                name: DataTypes.STRING
            }, { tableName: 'datasource' });

            Datasource.plugin(slugs('name'));
        });

        beforeEach(function () {
            return sequelize.sync({ force: true });
        });

        it('should add a slug field', function () {
            return Datasource.create({ name: 'World Demo' })
                .then(function (datasource) {
                    datasource.should.have.property('slug', 'world-demo');
                });
        });
    });

    describe('when an entity has slug support on the id', function () {
        let Datasource;

        beforeEach(function () {
            Datasource = sequelize.define('Datasource', {
                id: { type: DataTypes.STRING, primaryKey: true },
                name: DataTypes.STRING
            }, { tableName: 'datasource' });

            Datasource.plugin(slugs('name', 'id'));
        });

        beforeEach(function () {
            return sequelize.sync({ force: true });
        });

        it('should generate an id from a name', function () {
            return Datasource.create({ name: 'World Demo' })
                .then(function (datasource) {
                    datasource.should.have.property('id', 'world-demo');
                });
        });
    });
});