#include "wrapper.h"

#include "unabto/unabto_common_main.h"
#include "unabto_version.h"

#include <modules/util/read_hex.h>

// The uNabto main config structure.
nabto_main_setup* nms;

char* unabtoVersion() {
  static char version[21];
  sprintf(version, PRIversion, MAKE_VERSION_PRINTABLE());
  return version;
}

int unabtoConfigure(const char* id, const char* presharedKey, uint16_t localPort) {
  setbuf(stdout, NULL);

  nms = unabto_init_context();
  nms->id = strdup(id);
  nms->secureAttach = true;
  nms->secureData = true;
  nms->cryptoSuite = CRYPT_W_AES_CBC_HMAC_SHA256;
  if (localPort != 0) nms->localPort = localPort;
  if (!unabto_read_psk_from_hex(presharedKey, nms->presharedKey, 16))
    return -1;
  return 0;
}

int unabtoInit() { return (nms != NULL && unabto_init()) ? 0 : -1; }

void unabtoClose() { unabto_close(); }

void unabtoTick() { unabto_tick(); }

struct handler {
  int queryId;
  unabtoEventHandler handler;
};
struct handler currentHandlers[MAX_EVENT_HANDLERS];
int nextHandlerSlot = 0;
int unabtoRegisterEventHandler(int queryId, unabtoEventHandler handler) {
  if (nextHandlerSlot >= MAX_EVENT_HANDLERS) return -1;
  for (int i = 0; i < nextHandlerSlot; i++)
    if (currentHandlers[i].queryId == queryId)
      return -2;
  currentHandlers[nextHandlerSlot].queryId = queryId;
  currentHandlers[nextHandlerSlot].handler = handler;
  nextHandlerSlot++;
  return 0;
}

application_event_result application_event(
    application_request* request, unabto_query_request* query_request,
    unabto_query_response* query_response) {
  for (int i = 0; i < nextHandlerSlot; i++)
    if (currentHandlers[i].queryId == request->queryId)
      return currentHandlers[i].handler(request, query_request, query_response);
  return AER_REQ_INV_QUERY_ID;
}
