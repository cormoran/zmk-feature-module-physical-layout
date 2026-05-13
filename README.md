# ZMK Physical Layout Module

This ZMK module adds a custom ZMK Studio RPC subsystem for describing non-key physical devices in the keyboard layout, such as trackballs, rotary encoders, and trackpads. The web UI renders those modules together with the official ZMK key physical layout data.

The custom RPC subsystem identifier is:

```text
zmk__physical_layouts
```

## Install

Add the module to your `west.yml`:

```yaml
manifest:
  remotes:
    - name: cormoran
      url-base: https://github.com/cormoran
  projects:
    - name: zmk-feature-module-physical-layout
      remote: cormoran
      revision: main
  self:
    path: config
```

Enable the firmware feature and the Studio RPC endpoint:

```conf
CONFIG_ZMK_STUDIO=y
CONFIG_ZMK_PHYSICAL_LAYOUTS_FEATURE=y
CONFIG_ZMK_PHYSICAL_LAYOUTS_FEATURE_STUDIO_RPC=y
```

## Devicetree

Define each non-key physical module with one of the dedicated compatibles below. Coordinates use the same layout coordinate space as ZMK `zmk,physical-layout` key attributes. `size` fields are in millimeters.

### Trackball

Trackballs use `x`, `y`, and `size`. Common ball sizes are `34` and `25`.

```dts
/ {
    trackball0: trackball0 {
        compatible = "zmk,physical-layout-trackball";
        display-name = "Primary Trackball";
        size = <34>;
        x = <425>;
        y = <125>;

        linked-device-identifiers = "trackball_sensor", "trackball_button";
        linked-subsystems = "zmk__trackball", "zmk__pointing_buttons";
    };
};
```

### Rotary Encoders

Rotary encoders are bundled so each physical encoder can be mapped by `index` to ZMK's official rotary encoder array. Each encoder uses `x`, `y`, and `size`.

```dts
/ {
    rotary_encoders0: rotary_encoders0 {
        compatible = "zmk,physical-layout-rotary-encoders";
        display-name = "Rotary Encoders";
        encoders = <&encoder0>;
    };

    encoder0: encoder0 {
        compatible = "zmk,physical-layout-rotary-encoder";
        index = <0>;
        size = <18>;
        x = <600>;
        y = <80>;
    };
};
```

### Touch Pad

Touch pads use rectangular geometry and optional rotation fields.

```dts
/ {
    touchpad0: touchpad0 {
        compatible = "zmk,physical-layout-touch-pad";
        display-name = "Touch Pad";
        width = <240>;
        height = <180>;
        x = <625>;
        y = <180>;
        r = <0>;
        rx = <0>;
        ry = <0>;
        linked-device-identifiers = "touchpad_input";
        linked-subsystems = "zmk__touch_pad";
    };
};
```

### Custom Module

Use `zmk,physical-layout-custom-module` for module types that do not have a dedicated compatible.

```dts
/ {
    custom_module0: custom_module0 {
        compatible = "zmk,physical-layout-custom-module";
        display-name = "Status Display";
        type = "display";
        width = <220>;
        height = <80>;
        x = <160>;
        y = <40>;
        linked-device-identifiers = "status_display";
        linked-subsystems = "zmk__display";
    };
};
```

`linked-device-identifiers` and `linked-subsystems` are index-matched arrays. Use the custom Studio RPC device identifier, not the devicetree node name. Each link sent to Studio contains:

- Device instance identifier: copied from `linked-device-identifiers`.
- Device type identifier: the custom Studio RPC subsystem identifier from `linked-subsystems`.

The RPC response includes `enabled` for every physical device. For rotary encoder bundles, each encoder entry also includes `enabled`. These values follow the corresponding devicetree node `status`; nodes with `status = "disabled"` are still reported with `enabled = false`.

Rotation fields are supported by touch pads and custom modules:

```dts
r = <150>;  /* tenths of degrees */
rx = <500>;
ry = <200>;
```

## Web UI

The web UI lives in `web/` and uses the unofficial custom Studio RPC protocol.

```sh
cd web
npm install
npm run dev
```

## Development

```sh
pre-commit run
python3 -m unittest
west zmk-build tests/zmk-config
west zmk-test tests -m .
cd web && npm test
```
