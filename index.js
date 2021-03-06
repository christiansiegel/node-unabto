"use strict";

var ffi = require('ffi');
var path = require('path');
var ref = require('ref');
var struct = require('ref-struct');
var uint32 = require('uint32');

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

var UnabtoConfig = struct({
  'deviceId': ref.types.CString,
  'presharedKey': ref.types.CString,
  'localPort': ref.types.uint16,
  'deviceName': ref.types.CString,
  'productName': ref.types.CString,
  'iconUrl': ref.types.CString,
  'deviceInterfaceId': ref.types.CString,
  'deviceInterfaceVersionMajor': ref.types.uint16,
  'deviceInterfaceVersionMinor': ref.types.uint16,
  'systemPermissions': ref.types.uint32,
  'defaultUserPermissions': ref.types.uint32,
  'firstUserPermissions': ref.types.uint32,
  'aclFile': ref.types.CString
});

var libunabto = ffi.Library(path.resolve(__dirname, 'libunabto'), {
  'unabtoVersion': [ref.types.CString, []],
  'unabtoInit': [ref.types.int, [ref.refType(UnabtoConfig), ref.types.bool]],
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

function validateDevice(device, appMyProduct) {
  if (!device.hasOwnProperty("id"))
    throw new Error("Device should have an ID!");
  if (!device.hasOwnProperty("presharedKey"))
    throw new Error("Device should have a pre-shared key!");
  if (appMyProduct) {
    if (!device.hasOwnProperty("name"))
      throw new Error("Device should have a name!");
    if (!device.hasOwnProperty("productName"))
      throw new Error("Device should have a product name!");
    if (!device.hasOwnProperty("iconUrl"))
      throw new Error("Device should have an icon url!");
    if (!device.hasOwnProperty("iface"))
      throw new Error("Device should have an interface definition!");
    if (!device.iface.hasOwnProperty("id"))
      throw new Error("Device interface should have an ID!");
    if (!device.iface.hasOwnProperty("version"))
      throw new Error("Device interface should have a version!");
    if (!device.iface.version.hasOwnProperty("minor"))
      throw new Error("Device interface version should have a minor number!");
    if (!device.iface.version.hasOwnProperty("major"))
      throw new Error("Device interface version should have a major number!");
    if (!device.hasOwnProperty("permission"))
      throw new Error("Device should have an permission definition!");
    if (!device.permission.hasOwnProperty("system"))
      throw new Error("Device should have an system permission definition!");
    if (!device.permission.hasOwnProperty("firstUser"))
      throw new Error("Device should have an first user permission definition!");
    if (!device.permission.hasOwnProperty("defaultUser"))
      throw new Error("Device should have an default user permission definition!");
    if (!device.permission.hasOwnProperty("dbFile"))
      throw new Error("Device should have a file to store the permission database!");
  }
};

function tick() {
  libunabto.unabtoTick();
  setTimeout(tick, 10);
}

exports.version = function () {
  return libunabto.unabtoVersion();
};

exports.init = function (device, appMyProduct) {
  appMyProduct = appMyProduct || false;
  validateDevice(device, appMyProduct);

  var config = new UnabtoConfig();
  config.deviceId = device.id;
  config.presharedKey = device.presharedKey;
  config.localPort = device.localPort || 0;

  if (appMyProduct) {
    config.deviceName = device.name;
    config.productName = device.productName;
    config.iconUrl = device.iconUrl;
    config.deviceInterfaceId = device.iface.id;
    config.deviceInterfaceVersionMajor = device.iface.version.major;
    config.deviceInterfaceVersionMinor = device.iface.version.minor;
    config.aclFile = device.permission.dbFile;

    config.systemPermissions = uint32.or(
      device.permission.system.pairing ? 0x20000000 : 0,
      device.permission.system.local ? 0x40000000 : 0,
      device.permission.system.remote ? 0x80000000 : 0
    );

    config.firstUserPermissions = uint32.or(
      device.permission.firstUser.admin ? 0x20000000 : 0,
      device.permission.firstUser.local ? 0x40000000 : 0,
      device.permission.firstUser.remote ? 0x80000000 : 0
    );

    config.defaultUserPermissions = uint32.or(
      device.permission.defaultUser.admin ? 0x20000000 : 0,
      device.permission.defaultUser.local ? 0x40000000 : 0,
      device.permission.defaultUser.remote ? 0x80000000 : 0
    );
  }

  var res = libunabto.unabtoInit(config.ref(), appMyProduct);
  if (res == -1)
    throw new Error("Invalid pre-shared key!");
  if (res == -2)
    throw new Error("Cannot load access control list file!");
  if (res == -3)
    throw new Error("Error initializing Nabto!");

  tick();
};

exports.close = function () {
  clearTimeout(tick);
  libunabto.unabtoClose();
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
  if (res == -2)
    throw new Error("Handler for queryId " + queryId + " already registered!");
  _callbacks.push(callback);
};
