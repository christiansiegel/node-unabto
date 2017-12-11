//
// Basic example demonstrating the uNabto wrapper API.
//

var sleep = require('sleep');
var unabto = require('unabto');

// Print uNabto version
console.log("uNabto version: " + unabto.version());

// Register event handler for query ID 1
unabto.registerHandler(1, function (request, queryRequest, queryResponse) {
  var val = queryRequest.readInt8(); // read from received request
  queryResponse.writeUInt32(42); // write something to response
});

// Start uNabto
unabto.init({
  id: "<DEVICE ID>", // Device ID from https://appmyproduct.com/
  presharedKey: "<PRESHARED KEY>", // Licence key from https://appmyproduct.com/
  localPort: 9000, // optional
});

// Do something else...
sleep.sleep(10);

// Close uNabto
unabto.close();

// Exit Node.js
process.exit()
