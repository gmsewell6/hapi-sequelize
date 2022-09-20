'use strict';

const chai = require('chai');
const should = chai.should();
const stream = require('stream');
const $ = require('./common');

describe('LobPlugin', function () {
    it('should create a lob', function () {
        return $.sequelize.lobCreate()
            .then(function (lob) {
                should.exist(lob);
                return $.sequelize.lobUnlink(lob);
            });
    });

    describe('when a lob exists', function () {
        let lobId;

        beforeEach(function () {
            return $.sequelize.lobCreate()
                .then(function (res) {
                    lobId = res;
                });
        });

        afterEach(function () {
            return $.sequelize.lobUnlink(lobId);
        });

        it('should write a stream to it', function () {
            const readStream = new stream.Readable();
            readStream._read = function () {
                this.push('this is a test');
                this.push(null);
            };

            return $.sequelize.lobWrite(lobId, readStream);
        });

        it('should read a stream from it', function () {
            const readStream = new stream.Readable();
            readStream._read = function () {
                this.push('this is a test');
                this.push(null);
            };

            const writeStream = new stream.Writable();
            writeStream.bufs = [];
            writeStream._write = function (chunk, enc, done) {
                this.bufs.push(chunk);
                done();
            };

            writeStream.result = function () {
                return Buffer.concat(this.bufs);
            };

            return $.sequelize.lobWrite(lobId, readStream)
                .then(function () {
                    return $.sequelize.lobRead(lobId, writeStream);
                })
                .then(function () {
                    writeStream.result().toString().should.equal('this is a test');
                });
        });

        it('should truncate an existing lob', function () {
            const readStream = new stream.Readable();
            readStream._read = function () {
                this.push('this is a test');
                this.push(null);
            };

            const writeStream = new stream.Writable();
            writeStream.bufs = [];
            writeStream._write = function (chunk, enc, done) {
                this.bufs.push(chunk);
                done();
            };

            writeStream.result = function () {
                return Buffer.concat(this.bufs);
            };

            return $.sequelize.lobWrite(lobId, readStream)
                .then(function () {
                    return $.sequelize.lobTruncate(lobId);
                })
                .then(function () {
                    return $.sequelize.lobRead(lobId, writeStream);
                })
                .then(function () {
                    writeStream.bufs.should.have.length(0);
                });
        });

        it('should get the size', function () {
            const readStream = new stream.Readable();
            readStream._read = function () {
                this.push('this is a test');
                this.push(null);
            };

            return $.sequelize.lobWrite(lobId, readStream)
                .then(function () {
                    return $.sequelize.lobSize(lobId);
                })
                .then(function (size) {
                    size.should.equal('this is a test'.length);
                });
        });
    });
});