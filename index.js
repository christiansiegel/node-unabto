"use strict";

var ffi = require('ffi');
var path = require('path');
var ref = require('ref');
var struct = require('ref-struct');

const AER_REQ_RESPONSE_READY = 0;
const AER_REQ_TOO_SMALL = 5;
const AER_REQ_RSP_TOO_LARGE = 8;
const AER_REQ_SYSTEM_ERROR = 10;

var _callbacks = [];

var application_request = struct({
  'queryId': ref.types.uint32,
  'clientId': ref.types.CString,
  'connection': ref.refType(ref.types.void),
  'isLocal': ref.types.bool,
  'isLegacy': ref.types.bool
});

var unabto_buffer = struct({
  'size': ref.types.uint16,
  'data': ref.refType(ref.types.uint8)
});

var unabto_abuffer = struct({
  'buffer': ref.refType(unabto_buffer),
  'position': ref.types.uint16
});

var libunabto = ffi.Library(path.resolve(__dirname, 'libunabto'), {
  'unabtoVersion': [ref.types.CString, []],
  'unabtoConfigure': [ref.types.int, [ref.types.CString, ref.types.CString, ref.types.uint16]],
  'unabtoInit': [ref.types.int, []],
  'unabtoClose': [ref.types.void, []],
  'unabtoTick': [ref.types.void, []],
  'unabtoRegisterEventHandler': [ref.types.int, [ref.types.int, ref.refType(ref.types.void)]]
});

class UNabtoRequestTooSmallError extends Error {}

class UNabtoResponseTooLargeError extends Error {}

class UNabtoApplicationRequest {
  constructor(application_request_ptr) {
    this.queryId = application_request_ptr.deref().queryId;
    this.clientId = application_request_ptr.deref().clientId;
    this.isLocal = application_request_ptr.deref().isLocal;
    this.isLegacy = application_request_ptr.deref().isLegacy;
  }
}

class UNabtoBuffer {
  constructor(unabto_abuffer_ptr) {
    this.size = unabto_abuffer_ptr.deref().buffer.deref().size;
    this._buffer = unabto_abuffer_ptr;
  }

  _position() {
    return this._buffer.deref().position;
  };

  _setPosition(position) {
    if (0 <= position || position < _size)
      this._buffer.deref().position = position;
  };

  _increasePosition(bytes) {
    this._setPosition(this._position() + bytes);
  };

  _unused() {
    return this.size - this._position();
  };

  _data() {
    return ref.reinterpret(this._buffer.deref().buffer.deref().data, this.size);
  };
}

class UNabtoQueryResponse extends UNabtoBuffer {
  _posCheckUpdate(bytes) {
    if (this._unused() < bytes) throw new UNabtoResponseTooLargeError();
    var pos = this._position();
    this._increasePosition(bytes)
    return pos;
  }

  writeInt8(value) {
    this._data().writeInt8(value, this._posCheckUpdate(1));
  }

  writeInt16(value) {
    this._data().writeInt16BE(value, this._posCheckUpdate(2));
  }

  writeInt32(value) {
    this._data().writeInt32BE(value, this._posCheckUpdate(4));
  }

  writeUInt8(value) {
    this._data().writeUInt8(value, this._posCheckUpdate(1));
  }

  writeUInt16(value) {
    this._data().writeUInt16BE(value, this._posCheckUpdate(2));
  }

  writeUInt32(value) {
    this._data().writeUInt32BE(value, this._posCheckUpdate(4));
  }

  writeUInt8List(list) {
    this.writeUInt16(list.length);
    list.forEach(function (entry) {
      this.writeUInt8(entry);
    });
  }

  writeString(string) {
    this.writeUInt16(string.length);
    this._data().write(string, this._posCheckUpdate(string.length), 'utf8');
  }
}

class UNabtoQueryRequest extends UNabtoBuffer {
  _posCheckUpdate(bytes) {
    if (this._unused() < bytes) throw new UNabtoRequestTooSmallError();
    var pos = this._position();
    this._increasePosition(bytes)
    return pos;
  }

  readInt8() {
    return this._data().readInt8(this._posCheckUpdate(1));
  }

  readInt16() {
    return this._data().readInt16BE(this._posCheckUpdate(2));
  }

  readInt32() {
    return this._data().readInt32BE(this._posCheckUpdate(4));
  }

  readUInt8() {
    return this._data().readUInt8(this._posCheckUpdate(1));
  }

  readUInt16() {
    return this._data().readUInt16BE(this._posCheckUpdate(2));
  }

  readUInt32() {
    return this._data().readUInt32BE(this._posCheckUpdate(4));
  }

  readUint8List() {
    var length = this.readUInt16();
    var list = [];
    for (var i = 0; i < length; ++i) {
      list.push(this.readUInt());
    }
    return list;
  }

  readString() {
    var length = this.readUInt16();
    var start = this._posCheckUpdate(length);
    return this._data().toString('utf8', start, start + length);
  }
}

exports.version = function () {
  return libunabto.unabtoVersion();
};

exports.config = function (id, presharedKey, localPort) {
  localPort = localPort || 0;
  if (libunabto.unabtoConfigure(id, presharedKey, localPort) == -1)
    throw new Error("Invalid pre-shared key");
};

exports.init = function () {
  if (libunabto.unabtoInit() == -1)
    throw new Error("Error initializing Nabto");
};

exports.close = function () {
  libunabto.unabtoClose();
};

exports.tick = function () {
  libunabto.unabtoTick();
};

exports.registerHandler = function (queryId, handler) {
  var callback = ffi.Callback(ref.types.int, [ref.refType(application_request), ref.refType(unabto_abuffer), ref.refType(unabto_abuffer)],
    function (requestPtr, queryRequestPtr, queryResponsePtr) {
      var request = new UNabtoApplicationRequest(requestPtr);
      var queryRequest = new UNabtoQueryRequest(queryRequestPtr);
      var queryResponse = new UNabtoQueryResponse(queryResponsePtr);
      try {
        handler(request, queryRequest, queryResponse);
        return AER_REQ_RESPONSE_READY;
      } catch (err) {
        if (err instanceof UNabtoRequestTooSmallError) {
          console.error("The uNabto request is too small!");
          return AER_REQ_TOO_SMALL;
        } else if (err instanceof UNabtoResponseTooLargeError) {
          console.error("The uNabto response is larger than the space allocated!");
          return AER_REQ_RSP_TOO_LARGE;
        } else {
          console.error("Error '" + err + "' in callback handler!");
          return AER_REQ_SYSTEM_ERROR;
        }
      }
    });
  var res = libunabto.unabtoRegisterEventHandler(queryId, callback);
  if (res == -1)
    throw new Error("Can't register more handlers!");
  else if (res == -2)
    throw new Error("Handler for queryId " + queryId + " already registered!");
  else
    _callbacks.push(callback);
};
