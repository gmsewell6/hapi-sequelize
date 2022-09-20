'use strict';

const $ = require('./common');
const should = $.should;
const Foo = $.models.Foo;

describe('restore defaults plugin', function () {
    let foo;

    it('should allow updating an existing attribute with null and clear its changes', function () {
        return Foo.create({
            id: 'myFoo',
            immutableAttr: 'immutable'
        })
            .then(function () {
                return Foo.find({ where: { id: 'myFoo' } });
            })
            .then(function (f) {
                foo = f;
                should.exist(foo);
                should.not.exist(foo._changes);
                should.not.exist(foo.name);
                return foo.updateAttributes({ name: 'The Foo' });
            })
            .then(function () {
                return foo.reload();
            })
            .then(function () {
                should.exist(foo.name);
                should.exist(foo._changes);
                foo.name.should.equal('The Foo');
                foo._changes.should.be.an('Object');
                foo._changes.should.have.deep.property('current.name', 'The Foo');
                foo._changes.should.have.deep.property('original.name', null);
                return Foo.find({ where: { id: 'myFoo' } });
            })
            .then(function (res) {
                foo = res;
                return foo.updateAttributes({ name: null });
            })
            .then(function () {
                return foo.reload();
            })
            .then(function () {
                should.not.exist(foo.name);
                should.not.exist(foo._changes);
            });
    });
});