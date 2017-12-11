//
// Heatpump example similar to the AppMyProduct heatpump device stub from the
// AppMyProduct tutorial (https://www.appmyproduct.com/tutorial.html).
//

var unabto = require('unabto');

// Print uNabto version
console.log("uNabto version: " + unabto.version());

// Define heatpump modes and states
var HeatpumpMode = {
  COOL: 0,
  HEAT: 1,
  CIRCULATE: 2,
  DEHUMIDIFY: 3,
  properties: {
    0: {name: "cool"},
    1: {name: "heat"},
    2: {name: "circulate"},
    3: {name: "dehumidify"}
  }
};

var HeatpumpState = {
  OFF: 0,
  ON: 1,
  properties: {
    0: {name: "off"},
    1: {name: "on"},
  }
};

// Set initial heatpump values
var heatpumpState = HeatpumpState.ON;
var heatpumpMode = HeatpumpMode.HEAT;
var heatpumpTargetTemperature = 23;

// Simulate room temperature
var roomTemperature = 19;

function roomTemperatureSimulation() {
  if (heatpumpState == HeatpumpState.ON) {
    if (roomTemperature < heatpumpTargetTemperature) roomTemperature++;
    else if (roomTemperature > heatpumpTargetTemperature) roomTemperature--;
  }
  setTimeout(roomTemperatureSimulation, 1000);
}
roomTemperatureSimulation();

// Register event handlers for heatpump demo requests as defined in interface 
// definition shared with the client - for the default demo, see
// https://github.com/nabto/ionic-starter-nabto/blob/master/www/nabto/unabto_queries.xml

// Event handler for query heatpump_get_full_state.json
unabto.registerHandler(20000, function (request, queryRequest, queryResponse) {
  queryResponse.writeUInt8(heatpumpState);
  queryResponse.writeUInt32(heatpumpMode);
  queryResponse.writeUInt32(heatpumpTargetTemperature);
  queryResponse.writeUInt32(roomTemperature);
  console.log("Returned full heatpump state.");
});

// Event handler for query heatpump_set_activation_state.json
unabto.registerHandler(20010, function (request, queryRequest, queryResponse) {
  heatpumpState = queryRequest.readUInt8();
  queryResponse.writeUInt8(heatpumpState);
  console.log("Got (and returned) heatpump state: " + HeatpumpState.properties[heatpumpState].name);
});

// Event handler for query heatpump_set_target_temperature.json
unabto.registerHandler(20020, function (request, queryRequest, queryResponse) {
  heatpumpTargetTemperature = queryRequest.readUInt32();
  queryResponse.writeUInt32(heatpumpTargetTemperature);
  console.log("Got (and returned) heatpump target temperature: " + heatpumpTargetTemperature);
});

// Event handler for query heatpump_set_mode.json
unabto.registerHandler(20030, function (request, queryRequest, queryResponse) {
  heatpumpMode = queryRequest.readUInt32();
  queryResponse.writeUInt32(heatpumpMode);
  console.log("Got (and returned) heatpump mode: " + HeatpumpMode.properties[heatpumpMode].name);
});

// Start uNabto
unabto.init({
  id: "<DEVICE ID>",
  presharedKey: "<PRESHARED KEY>",
  name: "AMP Node.js Stub",
  productName: "ACME 9002 Heatpump",
  iconUrl: "img/chip-small.png",
  iface: {
    id: "317aadf2-3137-474b-8ddb-fea437c424f4",
    version: {
      major: 1,
      minor: 0
    }
  },
  permission: {
    dbFile: __dirname + "/acl.db",
    system: {
      pairing: true,
      local: true,
      remote: true
    },
    firstUser: {
      admin: true,
      local: true,
      remote: true
    },
    defaultUser: {
      admin: false,
      local: true,
      remote: false
    }
  }
}, true); // true = handle general AppMyProduct queries internally
