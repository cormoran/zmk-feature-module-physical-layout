import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import "./App.css";
import { call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import {
  ZMKConnection,
  ZMKCustomSubsystem,
  ZMKAppContext,
} from "@cormoran/zmk-studio-react-hook";
import {
  Request,
  Response,
  type PhysicalDevice,
  type RectPhysicalAttrs,
} from "./proto/zmk/physical_layouts/physical_layouts";

export const SUBSYSTEM_IDENTIFIER = "zmk__physical_layouts";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Physical Layout Studio</h1>
        <p>Keyboard and module geometry</p>
      </header>

      <ZMKConnection
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="panel">
            <h2>Device Connection</h2>
            {isLoading && <p>Connecting...</p>}
            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}
            {!isLoading && (
              <button
                className="btn btn-primary"
                onClick={() => connect(serial_connect)}
              >
                Connect Serial
              </button>
            )}
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="panel">
              <h2>Device Connection</h2>
              <div className="device-info">
                <h3>Connected to: {deviceName}</h3>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>

            <PhysicalLayoutSection />
          </>
        )}
      />

      <footer className="app-footer">
        <p>Custom Studio RPC subsystem: {SUBSYSTEM_IDENTIFIER}</p>
      </footer>
    </div>
  );
}

type LayoutState = {
  keys: KeyPhysicalAttrs[];
  modules: PhysicalDevice[];
};

const EMPTY_LAYOUT: LayoutState = { keys: [], modules: [] };
const MM_TO_LAYOUT_UNITS = 4;

type ModulePresentation = {
  kind: "trackball" | "rotary-encoder" | "touch-pad" | "custom-module";
  label: string;
  attrs: RectPhysicalAttrs;
  sizeText: string;
};

function modulePresentation(module: PhysicalDevice): ModulePresentation | null {
  if (module.trackball?.attrs) {
    const size = module.trackball.attrs.size * MM_TO_LAYOUT_UNITS;
    return {
      kind: "trackball",
      label: "trackball",
      attrs: {
        x: module.trackball.attrs.x,
        y: module.trackball.attrs.y,
        width: size,
        height: size,
        r: 0,
        rx: 0,
        ry: 0,
      },
      sizeText: `${module.trackball.attrs.size} mm`,
    };
  }

  if (module.rotaryEncoder?.attrs) {
    const size = module.rotaryEncoder.attrs.size * MM_TO_LAYOUT_UNITS;
    return {
      kind: "rotary-encoder",
      label: "rotary encoder",
      attrs: {
        x: module.rotaryEncoder.attrs.x,
        y: module.rotaryEncoder.attrs.y,
        width: size,
        height: size,
        r: 0,
        rx: 0,
        ry: 0,
      },
      sizeText: `${module.rotaryEncoder.attrs.size} mm`,
    };
  }

  if (module.touchPad?.attrs) {
    return {
      kind: "touch-pad",
      label: "touch pad",
      attrs: module.touchPad.attrs,
      sizeText: `${module.touchPad.attrs.width} x ${module.touchPad.attrs.height}`,
    };
  }

  if (module.customModule?.attrs) {
    return {
      kind: "custom-module",
      label: module.customModule.type || "custom module",
      attrs: module.customModule.attrs,
      sizeText: `${module.customModule.attrs.width} x ${module.customModule.attrs.height}`,
    };
  }

  return null;
}

function geometryOf(item: KeyPhysicalAttrs | ModulePresentation) {
  return "attrs" in item ? item.attrs : item;
}

function buildViewBox(keys: KeyPhysicalAttrs[], modules: PhysicalDevice[]) {
  const modulePresentations = modules
    .map(modulePresentation)
    .filter((module): module is ModulePresentation => module !== null);
  const geometries: Array<KeyPhysicalAttrs | RectPhysicalAttrs> = [
    ...keys,
    ...modulePresentations.map((module) => module.attrs),
  ];

  if (!geometries.length) {
    return { minX: 0, minY: 0, width: 600, height: 300 };
  }

  const minX = Math.min(...geometries.map((item) => item.x));
  const minY = Math.min(...geometries.map((item) => item.y));
  const maxX = Math.max(...geometries.map((item) => item.x + item.width));
  const maxY = Math.max(...geometries.map((item) => item.y + item.height));
  const padding = 40;

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 200),
    height: Math.max(maxY - minY + padding * 2, 160),
  };
}

function transformFor(item: KeyPhysicalAttrs | ModulePresentation) {
  const attrs = geometryOf(item);

  const cx = attrs.rx || attrs.x + attrs.width / 2;
  const cy = attrs.ry || attrs.y + attrs.height / 2;
  return attrs.r ? `rotate(${attrs.r / 10} ${cx} ${cy})` : "";
}

export function PhysicalLayoutSection() {
  const zmkApp = useContext(ZMKAppContext);
  const [layout, setLayout] = useState<LayoutState>(EMPTY_LAYOUT);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const subsystem = zmkApp?.findSubsystem(SUBSYSTEM_IDENTIFIER);

  const loadPhysicalLayout = useCallback(async () => {
    if (!zmkApp?.state.connection || !subsystem) return;

    setIsLoading(true);
    setError(null);

    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index
      );

      const request = Request.create({
        getPhysicalLayout: {},
      });

      const payload = Request.encode(request).finish();
      const [modulePayload, keymapResponse] = await Promise.all([
        service.callRPC(payload),
        call_rpc(zmkApp.state.connection, {
          keymap: { getPhysicalLayouts: true },
        }).catch(() => null),
      ]);

      const nextLayout: LayoutState = {
        keys:
          keymapResponse?.keymap?.getPhysicalLayouts?.layouts[
            keymapResponse.keymap.getPhysicalLayouts.activeLayoutIndex
          ]?.keys ?? [],
        modules: [],
      };

      if (modulePayload) {
        const resp = Response.decode(modulePayload);
        if (resp.physicalLayout) {
          nextLayout.modules = resp.physicalLayout.devices;
        } else if (resp.error) {
          throw new Error(resp.error.message);
        }
      }

      setLayout(nextLayout);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to load layout data"
      );
    } finally {
      setIsLoading(false);
    }
  }, [subsystem, zmkApp]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPhysicalLayout(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPhysicalLayout]);

  const viewBox = useMemo(
    () => buildViewBox(layout.keys, layout.modules),
    [layout.keys, layout.modules]
  );

  if (!zmkApp) return null;

  if (!subsystem) {
    return (
      <section className="panel">
        <div className="warning-message">
          <p>
            Subsystem "{SUBSYSTEM_IDENTIFIER}" not found. Make sure your
            firmware includes the physical layout module.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel layout-panel">
      <div className="section-heading">
        <div>
          <h2>Physical Layout</h2>
          <p>
            {layout.keys.length} keys, {layout.modules.length} modules
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={isLoading}
          onClick={() => void loadPhysicalLayout()}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <svg
        className="layout-canvas"
        role="img"
        aria-label="Physical layout"
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      >
        {layout.keys.map((key, index) => (
          <rect
            className="layout-key"
            key={`key-${index}`}
            x={key.x}
            y={key.y}
            width={key.width}
            height={key.height}
            rx={6}
            transform={transformFor(key)}
          />
        ))}
        {layout.modules.map((module) => {
          const presentation = modulePresentation(module);
          if (!presentation) return null;

          const cornerRadius =
            presentation.kind === "trackball" ||
            presentation.kind === "rotary-encoder"
              ? presentation.attrs.width / 2
              : 8;

          return (
            <g key={module.identifier} transform={transformFor(presentation)}>
              <rect
                className={`layout-module layout-module-${presentation.kind}`}
                x={presentation.attrs.x}
                y={presentation.attrs.y}
                width={presentation.attrs.width}
                height={presentation.attrs.height}
                rx={cornerRadius}
              />
              <text
                className="layout-module-label"
                x={presentation.attrs.x + presentation.attrs.width / 2}
                y={presentation.attrs.y + presentation.attrs.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {module.displayName}
              </text>
            </g>
          );
        })}
      </svg>

      {error && <p className="error-message">{error}</p>}

      {layout.modules.length > 0 && (
        <div className="module-list">
          {layout.modules.map((module) => {
            const presentation = modulePresentation(module);
            if (!presentation) return null;

            return (
              <article className="module-row" key={module.identifier}>
                <div>
                  <h3>{module.displayName}</h3>
                  <p>{presentation.label}</p>
                </div>
                <dl>
                  <div>
                    <dt>Position</dt>
                    <dd>
                      {presentation.attrs.x}, {presentation.attrs.y}
                    </dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{presentation.sizeText}</dd>
                  </div>
                  <div>
                    <dt>Links</dt>
                    <dd>
                      {module.links.length
                        ? module.links
                            .map(
                              (link) =>
                                `${link.deviceIdentifier} (${link.subsystemIdentifier})`
                            )
                            .join(", ")
                        : "None"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default App;
