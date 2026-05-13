#include <pb_decode.h>
#include <pb_encode.h>
#include <zmk/studio/custom.h>
#include <zmk/physical_layouts/physical_layouts.pb.h>

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/util.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

static struct zmk_rpc_custom_subsystem_meta physical_layouts_feature_meta = {
    ZMK_RPC_CUSTOM_SUBSYSTEM_UI_URLS(
        "http://cormoran.github.io/zmk-feature-module-physical-layout/"),
    // Unsecured is suggested by default to avoid unlocking in un-reliable
    // environments.
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

ZMK_RPC_CUSTOM_SUBSYSTEM(zmk__physical_layouts, &physical_layouts_feature_meta,
                         physical_layouts_rpc_handle_request);

ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER(zmk__physical_layouts, zmk_physical_layouts_Response);

static int handle_get_physical_layout_request(zmk_physical_layouts_Response *resp);

static bool physical_layouts_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                                pb_callback_t *encode_response) {
    zmk_physical_layouts_Response *resp =
        ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE(zmk__physical_layouts, encode_response);

    zmk_physical_layouts_Request req = zmk_physical_layouts_Request_init_zero;

    pb_istream_t req_stream =
        pb_istream_from_buffer(raw_request->payload.bytes, raw_request->payload.size);
    if (!pb_decode(&req_stream, zmk_physical_layouts_Request_fields, &req)) {
        LOG_WRN("Failed to decode physical layouts request: %s", PB_GET_ERROR(&req_stream));
        zmk_physical_layouts_ErrorResponse err = zmk_physical_layouts_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to decode request");
        resp->which_response_type = zmk_physical_layouts_Response_error_tag;
        resp->response_type.error = err;
        return true;
    }

    int rc = 0;
    switch (req.which_request_type) {
    case zmk_physical_layouts_Request_get_physical_layout_tag:
        rc = handle_get_physical_layout_request(resp);
        break;
    default:
        LOG_WRN("Unsupported physical layouts request type: %d", req.which_request_type);
        rc = -1;
    }

    if (rc != 0) {
        zmk_physical_layouts_ErrorResponse err = zmk_physical_layouts_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to process request");
        resp->which_response_type = zmk_physical_layouts_Response_error_tag;
        resp->response_type.error = err;
    }
    return true;
}

#define PHYSICAL_LAYOUT_LINK_ASSERT(node_id)                                                       \
    BUILD_ASSERT(DT_PROP_LEN_OR(node_id, linked_device_identifiers, 0) ==                          \
                     DT_PROP_LEN_OR(node_id, linked_subsystems, 0),                                \
                 "linked-device-identifiers and linked-subsystems must have the same length")

#define PHYSICAL_LAYOUT_TRACKBALL_LINK_ASSERT(node_id)                                             \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_trackball),                        \
                (PHYSICAL_LAYOUT_LINK_ASSERT(node_id);), ())

#define PHYSICAL_LAYOUT_TOUCH_PAD_LINK_ASSERT(node_id)                                             \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_touch_pad),                        \
                (PHYSICAL_LAYOUT_LINK_ASSERT(node_id);), ())

#define PHYSICAL_LAYOUT_CUSTOM_MODULE_LINK_ASSERT(node_id)                                         \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_custom_module),                    \
                (PHYSICAL_LAYOUT_LINK_ASSERT(node_id);), ())

DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TRACKBALL_LINK_ASSERT);
DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TOUCH_PAD_LINK_ASSERT);
DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_CUSTOM_MODULE_LINK_ASSERT);

#define PHYSICAL_LAYOUT_LINK_ENCODE(idx, node_id)                                                  \
    do {                                                                                           \
        zmk_physical_layouts_LinkedDevice link = zmk_physical_layouts_LinkedDevice_init_zero;      \
        snprintf(link.device_identifier, sizeof(link.device_identifier), "%s",                     \
                 DT_PROP_BY_IDX(node_id, linked_device_identifiers, idx));                         \
        snprintf(link.subsystem_identifier, sizeof(link.subsystem_identifier), "%s",               \
                 DT_PROP_BY_IDX(node_id, linked_subsystems, idx));                                 \
        if (!pb_encode_tag_for_field(stream, field)) {                                             \
            LOG_WRN("Failed to encode linked device tag");                                         \
            return false;                                                                          \
        }                                                                                          \
        if (!pb_encode_submessage(stream, &zmk_physical_layouts_LinkedDevice_msg, &link)) {        \
            LOG_WRN("Failed to encode linked device submessage");                                  \
            return false;                                                                          \
        }                                                                                          \
    } while (false);

#define PHYSICAL_LAYOUT_LINK_ENCODER_NAME(node_id) UTIL_CAT(encode_links_, DT_NODE_HASH(node_id))

#define PHYSICAL_LAYOUT_LINK_ENCODER(node_id)                                                      \
    static bool PHYSICAL_LAYOUT_LINK_ENCODER_NAME(node_id)(                                        \
        pb_ostream_t * stream, const pb_field_t *field, void *const *arg) {                        \
        ARG_UNUSED(arg);                                                                           \
        LISTIFY(DT_PROP_LEN_OR(node_id, linked_device_identifiers, 0),                             \
                PHYSICAL_LAYOUT_LINK_ENCODE, (), node_id)                                          \
        return true;                                                                               \
    }

#define PHYSICAL_LAYOUT_TRACKBALL_LINK_ENCODER(node_id)                                            \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_trackball),                        \
                (PHYSICAL_LAYOUT_LINK_ENCODER(node_id)), ())

#define PHYSICAL_LAYOUT_TOUCH_PAD_LINK_ENCODER(node_id)                                            \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_touch_pad),                        \
                (PHYSICAL_LAYOUT_LINK_ENCODER(node_id)), ())

#define PHYSICAL_LAYOUT_CUSTOM_MODULE_LINK_ENCODER(node_id)                                        \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_custom_module),                    \
                (PHYSICAL_LAYOUT_LINK_ENCODER(node_id)), ())

DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TRACKBALL_LINK_ENCODER);
DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TOUCH_PAD_LINK_ENCODER);
DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_CUSTOM_MODULE_LINK_ENCODER);

#define PHYSICAL_LAYOUT_DEVICE_INIT(node_id)                                                       \
    zmk_physical_layouts_PhysicalDevice device = zmk_physical_layouts_PhysicalDevice_init_zero;    \
    snprintf(device.identifier, sizeof(device.identifier), "%s", DT_NODE_FULL_NAME(node_id));      \
    snprintf(device.display_name, sizeof(device.display_name), "%s",                               \
             DT_PROP(node_id, display_name));                                                      \
    device.enabled = DT_NODE_HAS_STATUS(node_id, okay);                                            \
    device.links.funcs.encode = PHYSICAL_LAYOUT_LINK_ENCODER_NAME(node_id)

#define PHYSICAL_LAYOUT_LINKED_DEVICE_INIT(node_id)                                                \
    PHYSICAL_LAYOUT_DEVICE_INIT(node_id);                                                          \
    device.links.funcs.encode = PHYSICAL_LAYOUT_LINK_ENCODER_NAME(node_id)

#define PHYSICAL_LAYOUT_DEVICE_ENCODE()                                                            \
    do {                                                                                           \
        if (!pb_encode_tag_for_field(stream, field)) {                                             \
            LOG_WRN("Failed to encode physical device tag");                                       \
            return false;                                                                          \
        }                                                                                          \
        if (!pb_encode_submessage(stream, &zmk_physical_layouts_PhysicalDevice_msg, &device)) {    \
            LOG_WRN("Failed to encode physical device submessage");                                \
            return false;                                                                          \
        }                                                                                          \
    } while (false)

#define PHYSICAL_LAYOUT_TRACKBALL_ENCODE(node_id)                                                  \
    do {                                                                                           \
        PHYSICAL_LAYOUT_LINKED_DEVICE_INIT(node_id);                                               \
        device.which_device_type = zmk_physical_layouts_PhysicalDevice_trackball_tag;              \
        device.device_type.trackball.has_attrs = true;                                             \
        device.device_type.trackball.attrs.x = DT_PROP(node_id, x);                                \
        device.device_type.trackball.attrs.y = DT_PROP(node_id, y);                                \
        device.device_type.trackball.attrs.size = DT_PROP(node_id, size);                          \
        PHYSICAL_LAYOUT_DEVICE_ENCODE();                                                           \
    } while (false);

#define PHYSICAL_LAYOUT_ROTARY_ENCODER_ENCODE(idx, node_id)                                        \
    do {                                                                                           \
        zmk_physical_layouts_RotaryEncoder encoder = zmk_physical_layouts_RotaryEncoder_init_zero; \
        encoder.enabled = DT_NODE_HAS_STATUS(node_id, okay) &&                                     \
                          DT_NODE_HAS_STATUS(DT_PHANDLE_BY_IDX(node_id, encoders, idx), okay);     \
        encoder.has_attrs = true;                                                                  \
        encoder.attrs.x = DT_PROP(DT_PHANDLE_BY_IDX(node_id, encoders, idx), x);                   \
        encoder.attrs.y = DT_PROP(DT_PHANDLE_BY_IDX(node_id, encoders, idx), y);                   \
        encoder.attrs.size = DT_PROP(DT_PHANDLE_BY_IDX(node_id, encoders, idx), size);             \
        if (!pb_encode_tag_for_field(stream, field)) {                                             \
            LOG_WRN("Failed to encode rotary encoder tag");                                        \
            return false;                                                                          \
        }                                                                                          \
        if (!pb_encode_submessage(stream, &zmk_physical_layouts_RotaryEncoder_msg, &encoder)) {    \
            LOG_WRN("Failed to encode rotary encoder submessage");                                 \
            return false;                                                                          \
        }                                                                                          \
    } while (false);

#define PHYSICAL_LAYOUT_ROTARY_ENCODERS_ENCODE(node_id)                                            \
    LISTIFY(DT_PROP_LEN(node_id, encoders), PHYSICAL_LAYOUT_ROTARY_ENCODER_ENCODE, (), node_id)

#define PHYSICAL_LAYOUT_TOUCH_PAD_ENCODE(node_id)                                                  \
    do {                                                                                           \
        PHYSICAL_LAYOUT_LINKED_DEVICE_INIT(node_id);                                               \
        device.which_device_type = zmk_physical_layouts_PhysicalDevice_touch_pad_tag;              \
        device.device_type.touch_pad.has_attrs = true;                                             \
        device.device_type.touch_pad.attrs.width = DT_PROP(node_id, width);                        \
        device.device_type.touch_pad.attrs.height = DT_PROP(node_id, height);                      \
        device.device_type.touch_pad.attrs.x = DT_PROP(node_id, x);                                \
        device.device_type.touch_pad.attrs.y = DT_PROP(node_id, y);                                \
        device.device_type.touch_pad.attrs.r = DT_PROP(node_id, r);                                \
        device.device_type.touch_pad.attrs.rx = DT_PROP(node_id, rx);                              \
        device.device_type.touch_pad.attrs.ry = DT_PROP(node_id, ry);                              \
        PHYSICAL_LAYOUT_DEVICE_ENCODE();                                                           \
    } while (false);

#define PHYSICAL_LAYOUT_CUSTOM_MODULE_ENCODE(node_id)                                              \
    do {                                                                                           \
        PHYSICAL_LAYOUT_LINKED_DEVICE_INIT(node_id);                                               \
        device.which_device_type = zmk_physical_layouts_PhysicalDevice_custom_module_tag;          \
        snprintf(device.device_type.custom_module.type,                                            \
                 sizeof(device.device_type.custom_module.type), "%s", DT_PROP(node_id, type));     \
        device.device_type.custom_module.has_attrs = true;                                         \
        device.device_type.custom_module.attrs.width = DT_PROP(node_id, width);                    \
        device.device_type.custom_module.attrs.height = DT_PROP(node_id, height);                  \
        device.device_type.custom_module.attrs.x = DT_PROP(node_id, x);                            \
        device.device_type.custom_module.attrs.y = DT_PROP(node_id, y);                            \
        device.device_type.custom_module.attrs.r = DT_PROP(node_id, r);                            \
        device.device_type.custom_module.attrs.rx = DT_PROP(node_id, rx);                          \
        device.device_type.custom_module.attrs.ry = DT_PROP(node_id, ry);                          \
        PHYSICAL_LAYOUT_DEVICE_ENCODE();                                                           \
    } while (false);

#define PHYSICAL_LAYOUT_TRACKBALL_ENCODE_IF(node_id)                                               \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_trackball),                        \
                (PHYSICAL_LAYOUT_TRACKBALL_ENCODE(node_id)), ())

#define PHYSICAL_LAYOUT_ROTARY_ENCODERS_ENCODE_IF(node_id)                                         \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_rotary_encoders),                  \
                (PHYSICAL_LAYOUT_ROTARY_ENCODERS_ENCODE(node_id)), ())

#define PHYSICAL_LAYOUT_TOUCH_PAD_ENCODE_IF(node_id)                                               \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_touch_pad),                        \
                (PHYSICAL_LAYOUT_TOUCH_PAD_ENCODE(node_id)), ())

#define PHYSICAL_LAYOUT_CUSTOM_MODULE_ENCODE_IF(node_id)                                           \
    COND_CODE_1(DT_NODE_HAS_COMPAT(node_id, zmk_physical_layout_custom_module),                    \
                (PHYSICAL_LAYOUT_CUSTOM_MODULE_ENCODE(node_id)), ())

static bool encode_physical_devices(pb_ostream_t *stream, const pb_field_t *field,
                                    void *const *arg) {
    ARG_UNUSED(arg);

    DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TRACKBALL_ENCODE_IF);
    DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_TOUCH_PAD_ENCODE_IF);
    DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_CUSTOM_MODULE_ENCODE_IF);
    return true;
}

static bool encode_rotary_encoders(pb_ostream_t *stream, const pb_field_t *field,
                                   void *const *arg) {
    ARG_UNUSED(arg);

    DT_FOREACH_CHILD(DT_ROOT, PHYSICAL_LAYOUT_ROTARY_ENCODERS_ENCODE_IF);
    return true;
}

static int handle_get_physical_layout_request(zmk_physical_layouts_Response *resp) {
    zmk_physical_layouts_GetPhysicalLayoutResponse result =
        zmk_physical_layouts_GetPhysicalLayoutResponse_init_zero;

    result.devices.funcs.encode = encode_physical_devices;
    result.rotary_encoders.funcs.encode = encode_rotary_encoders;

    resp->which_response_type = zmk_physical_layouts_Response_physical_layout_tag;
    resp->response_type.physical_layout = result;
    return 0;
}
