# Physical Layout Web UI

This React app connects to ZMK Studio, calls the `cormoran__physical_layouts` custom RPC subsystem, and renders non-key physical modules together with ZMK's official key physical layout data.

## Commands

```sh
npm install
npm run generate
npm test
npm run dev
```

The protobuf schema is defined in:

```text
../proto/zmk/physical_layouts/physical_layouts.proto
```

Generated TypeScript output is written under:

```text
src/proto/zmk/physical_layouts/
```
