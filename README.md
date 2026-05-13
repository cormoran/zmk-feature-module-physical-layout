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

Define each non-key physical module with `compatible = "zmk,physical-layout-device"`. Coordinates use the same units as ZMK `zmk,physical-layout` key attributes.

```dts
/ {
    trackball0: trackball0 {
        compatible = "zmk,physical-layout-device";
        display-name = "Primary Trackball";
        device-type = "trackball";
        width = <150>;
        height = <150>;
        x = <425>;
        y = <125>;

        linked-devices = <&kscan>;
        linked-subsystems = "zmk__trackball";
    };
};
```

`linked-devices` and `linked-subsystems` are index-matched arrays. Each link sent to Studio contains:

- Device instance identifier: derived from the linked devicetree node name or label.
- Device type identifier: the custom Studio RPC subsystem identifier from `linked-subsystems`.

Optional rotation fields are supported:

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
