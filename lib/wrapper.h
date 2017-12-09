// Library is not re-entrant
#ifndef WRAPPER_H_
#define WRAPPER_H_

#include <unabto/unabto_app.h>

// Returns the currently implemented version of uNabto.
char* unabtoVersion();

// Sets a new configuration.
int unabtoConfigure(const char* id, const char* presharedKey);

// Init and start the uNabto server with the specified configuration
int unabtoInit();

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
