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
  type PhysicalAttrs,
  type PhysicalDevice,
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

function geometryOf(item: KeyPhysicalAttrs | PhysicalDevice) {
  return "attrs" in item ? item.attrs : item;
}

function buildViewBox(keys: KeyPhysicalAttrs[], modules: PhysicalDevice[]) {
  const moduleAttrs = modules
    .map((module) => module.attrs)
    .filter((attrs): attrs is PhysicalAttrs => attrs !== undefined);
  const geometries: Array<KeyPhysicalAttrs | PhysicalAttrs> = [
    ...keys,
    ...moduleAttrs,
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

function transformFor(item: KeyPhysicalAttrs | PhysicalDevice) {
  const attrs = geometryOf(item);
  if (!attrs) return "";

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
          if (!module.attrs) return null;
          return (
            <g key={module.identifier} transform={transformFor(module)}>
              <rect
                className={`layout-module layout-module-${module.type}`}
                x={module.attrs.x}
                y={module.attrs.y}
                width={module.attrs.width}
                height={module.attrs.height}
                rx={module.type === "trackball" ? module.attrs.width / 2 : 8}
              />
              <text
                className="layout-module-label"
                x={module.attrs.x + module.attrs.width / 2}
                y={module.attrs.y + module.attrs.height / 2}
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
          {layout.modules.map((module) => (
            <article className="module-row" key={module.identifier}>
              <div>
                <h3>{module.displayName}</h3>
                <p>{module.type}</p>
              </div>
              <dl>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {module.attrs?.x ?? 0}, {module.attrs?.y ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {module.attrs?.width ?? 0} x {module.attrs?.height ?? 0}
                  </dd>
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
          ))}
        </div>
      )}
    </section>
  );
}

export default App;
