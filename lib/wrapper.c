#include "wrapper.h"

#include "unabto/unabto_common_main.h"
#include "unabto_version.h"

#include <modules/util/read_hex.h>

// Handle general and access control events of a typical AppMyProduct app.
bool appMyProduct_;

// The uNabto main config structure.
nabto_main_setup* nms_;

// The config structure containing all settings for this device
UnabtoConfig config_;

// The access control database
struct fp_acl_db db_;
struct fp_mem_persistence fp_file_;

#define REQUIRES_GUEST FP_ACL_PERMISSION_NONE
#define REQUIRES_OWNER FP_ACL_PERMISSION_ADMIN

char* unabtoVersion() {
  static char version[21];
  sprintf(version, PRIversion, MAKE_VERSION_PRINTABLE());
  return version;
}

int unabtoInit(UnabtoConfig* config, bool appMyProduct) {
  setbuf(stdout, NULL);

  config_ = *config;
  appMyProduct_ = appMyProduct;

  nms_ = unabto_init_context();
  nms_->id = strdup(config_.deviceId);
  nms_->secureAttach = true;
  nms_->secureData = true;
  nms_->cryptoSuite = CRYPT_W_AES_CBC_HMAC_SHA256;
  if (config_.localPort != 0) nms_->localPort = config_.localPort;
  if (!unabto_read_psk_from_hex(config_.presharedKey, nms_->presharedKey, 16))
    return -1;

  if (appMyProduct_) {
    struct fp_acl_settings default_settings;
    default_settings.systemPermissions = config_.systemPermissions;
    default_settings.defaultUserPermissions = config_.defaultUserPermissions;
    default_settings.firstUserPermissions = config_.firstUserPermissions;

    printf("%s", config_.aclFile);
    if (fp_acl_file_init(config_.aclFile, "tmp.bin", &fp_file_) != FP_ACL_DB_OK)
      return -2;
    fp_mem_init(&db_, &default_settings, &fp_file_);
    fp_acl_ae_init(&db_);
  }

  return unabto_init() ? 0 : -3;
}

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
    if (currentHandlers[i].queryId == queryId) return -2;
  currentHandlers[nextHandlerSlot].queryId = queryId;
  currentHandlers[nextHandlerSlot].handler = handler;
  nextHandlerSlot++;
  return 0;
}

int copy_buffer(unabto_query_request* read_buffer, uint8_t* dest,
                uint16_t bufSize, uint16_t* len) {
  uint8_t* buffer;
  if (!(unabto_query_read_uint8_list(read_buffer, &buffer, len))) {
    return AER_REQ_TOO_SMALL;
  }
  if (*len > bufSize) {
    return AER_REQ_TOO_LARGE;
  }
  memcpy(dest, buffer, *len);
  return AER_REQ_RESPONSE_READY;
}

int copy_string(unabto_query_request* read_buffer, char* dest,
                uint16_t destSize) {
  uint16_t len;
  int res = copy_buffer(read_buffer, (uint8_t*)dest, destSize - 1, &len);
  if (res != AER_REQ_RESPONSE_READY) {
    return res;
  }
  dest[len] = 0;
  return AER_REQ_RESPONSE_READY;
}

int write_string(unabto_query_response* write_buffer, const char* string) {
  return unabto_query_write_uint8_list(write_buffer, (uint8_t*)string,
                                       strlen(string));
}

application_event_result handleAmpEvents(
    application_request* request, unabto_query_request* query_request,
    unabto_query_response* query_response) {
  // handle general and access control requests as defined in interface
  // definition shared with client - for the default demo, see
  // https://github.com/nabto/ionic-starter-nabto/blob/master/www/nabto/unabto_queries.xml

  switch (request->queryId) {
    case 0:
      // get_interface_info.json
      if (!write_string(query_response, config_.deviceInterfaceId))
        return AER_REQ_RSP_TOO_LARGE;
      if (!unabto_query_write_uint16(query_response,
                                     config_.deviceInterfaceVersionMajor))
        return AER_REQ_RSP_TOO_LARGE;
      if (!unabto_query_write_uint16(query_response,
                                     config_.deviceInterfaceVersionMinor))
        return AER_REQ_RSP_TOO_LARGE;
      return AER_REQ_RESPONSE_READY;

    case 10000:
      // get_public_device_info.json
      if (!write_string(query_response, config_.deviceName))
        return AER_REQ_RSP_TOO_LARGE;
      if (!write_string(query_response, config_.productName))
        return AER_REQ_RSP_TOO_LARGE;
      if (!write_string(query_response, config_.iconUrl))
        return AER_REQ_RSP_TOO_LARGE;
      if (!unabto_query_write_uint8(query_response,
                                    fp_acl_is_pair_allowed(request)))
        return AER_REQ_RSP_TOO_LARGE;
      if (!unabto_query_write_uint8(query_response,
                                    fp_acl_is_user_paired(request)))
        return AER_REQ_RSP_TOO_LARGE;
      if (!unabto_query_write_uint8(query_response,
                                    fp_acl_is_user_owner(request)))
        return AER_REQ_RSP_TOO_LARGE;
      return AER_REQ_RESPONSE_READY;

    case 10010:
      // set_device_info.json
      if (!fp_acl_is_request_allowed(request, REQUIRES_OWNER))
        return AER_REQ_NO_ACCESS;
      application_event_result res = copy_string(
          query_request, config_.deviceName, sizeof(config_.deviceName));
      if (res != AER_REQ_RESPONSE_READY) return res;
      if (!write_string(query_response, config_.deviceName))
        return AER_REQ_RSP_TOO_LARGE;
      return AER_REQ_RESPONSE_READY;

    case 11000:
      // get_users.json
      return fp_acl_ae_users_get(request, query_request,
                                 query_response);  // implied admin priv check

    case 11010:
      // pair_with_device.json
      if (!fp_acl_is_pair_allowed(request)) return AER_REQ_NO_ACCESS;
      return fp_acl_ae_pair_with_device(request, query_request, query_response);

    case 11020:
      // get_current_user.json
      return fp_acl_ae_user_me(request, query_request, query_response);

    case 11030:
      // get_system_security_settings.json
      return fp_acl_ae_system_get_acl_settings(
          request, query_request, query_response);  // implied admin priv check

    case 11040:
      // set_system_security_settings.json
      return fp_acl_ae_system_set_acl_settings(
          request, query_request, query_response);  // implied admin priv check

    case 11050:
      // set_user_permissions.json
      return fp_acl_ae_user_set_permissions(
          request, query_request, query_response);  // implied admin priv check

    case 11060:
      // set_user_name.json
      return fp_acl_ae_user_set_name(
          request, query_request, query_response);  // implied admin priv check

    case 11070:
      // remove_user.json
      return fp_acl_ae_user_remove(request, query_request,
                                   query_response);  // implied admin priv check

    default:
      return AER_REQ_INV_QUERY_ID;
  }
}

application_event_result application_event(
    application_request* request, unabto_query_request* query_request,
    unabto_query_response* query_response) {
  if (appMyProduct_) {
    application_event_result res =
        handleAmpEvents(request, query_request, query_response);
    if (res != AER_REQ_INV_QUERY_ID) return res;
    if (!fp_acl_is_request_allowed(request, REQUIRES_GUEST))
      return AER_REQ_NO_ACCESS;
  }
  for (int i = 0; i < nextHandlerSlot; i++)
    if (currentHandlers[i].queryId == request->queryId)
      return currentHandlers[i].handler(request, query_request, query_response);
  return AER_REQ_INV_QUERY_ID;
}
