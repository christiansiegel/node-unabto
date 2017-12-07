var ffi = require('ffi');
var path = require('path');
var ref = require('ref');
var struct = require('ref-struct');

var libnabto = ffi.Library(path.resolve(__dirname,'libunabto'), {
  'unabtoVersion': ['string', []]
});

exports.version = function () {
    return libnabto.unabtoVersion();
};
