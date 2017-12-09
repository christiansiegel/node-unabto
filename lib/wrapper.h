// Library is not re-entrant
#ifndef WRAPPER_H_
#define WRAPPER_H_

#include <unabto/unabto_app.h>

#include <modules/fingerprint_acl/fp_acl_ae.h>
#include <modules/fingerprint_acl/fp_acl_file.h>
#include <modules/fingerprint_acl/fp_acl_memory.h>

// Defines a configuration of uNabto.
struct UnabtoConfig {
  // The device id of the server. This has to be unique.
  char* deviceId;
  // The preshared key of the secure connection.
  char* presharedKey;
  // The used local port of the server. Set to 0 for using default.
  uint16_t localPort;
  // The device name.
  char* deviceName;
  // The product name of the device.
  char* productName;
  // The icon url to use on the client.
  char* iconUrl;
  // The interface id.
  char* deviceInterfaceId;
  // The interface's major version number.
  uint16_t deviceInterfaceVersionMajor;
  // The interface's minor version number.
  uint16_t deviceInterfaceVersionMinor;
  // Permission bits controlling the system.
  uint32_t systemPermissions;
  // Default permissions for new users.
  uint32_t defaultUserPermissions;
  // Permissions to give the first user of the system.
  uint32_t firstUserPermissions;
  // The access control database file path.
  char* aclFile;
};
typedef struct UnabtoConfig UnabtoConfig;

// Returns the currently implemented version of uNabto.
char* unabtoVersion();

// Init and start the uNabto server with the specified configuration
int unabtoInit(UnabtoConfig* config, bool appMyProduct);

// Close the uNabto server.
void unabtoClose();

// Gives the uNabto a chance to process any external events, and invoke
// callbacks for any new event. This has to be called at least every
// 10 milliseconds to prevent communication issues.
void unabtoTick();

// Registers a new event handler callback function.
// No more than MAX_EVENT_HANDLERS handlers may be set.
#define MAX_EVENT_HANDLERS 1024
typedef application_event_result (*unabtoEventHandler)(
    application_request* request, unabto_query_request* query_request,
    unabto_query_response* query_response);
int unabtoRegisterEventHandler(int queryId, unabtoEventHandler handler);

#endif  // WRAPPER_H_
