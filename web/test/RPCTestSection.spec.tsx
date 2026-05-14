import { render, screen, waitFor } from "@testing-library/react";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
import { PhysicalLayoutSection, SUBSYSTEM_IDENTIFIER } from "../src/App";
import { Response } from "../src/proto/zmk/physical_layouts/physical_layouts";

type RpcRequest = {
  custom?: unknown;
  keymap?: unknown;
};

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  call_rpc: jest.fn(),
}));

jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/serial", () => ({
  connect: jest.fn(),
}));

const mockLayoutResponses = () => {
  (call_rpc as jest.Mock).mockImplementation(
    (_connection: unknown, request: RpcRequest) => {
      if (request.custom) {
        return Promise.resolve({
          custom: {
            call: {
              payload: Response.encode({
                physicalLayout: {
                  devices: [
                    {
                      identifier: "/trackball0",
                      displayName: "Primary Trackball",
                      enabled: true,
                      trackball: {
                        attrs: {
                          x: 425,
                          y: 125,
                          size: 120,
                          r: 150,
                          rx: 485,
                          ry: 185,
                        },
                      },
                      links: [
                        {
                          deviceIdentifier: "trackball_sensor",
                          subsystemIdentifier: "zmk__trackball",
                        },
                        {
                          deviceIdentifier: "trackball_button",
                          subsystemIdentifier: "zmk__pointing_buttons",
                        },
                      ],
                    },
                  ],
                  rotaryEncoders: [],
                },
              }).finish(),
            },
          },
        });
      }
      if (request.keymap) {
        return Promise.resolve({
          keymap: {
            getPhysicalLayouts: {
              activeLayoutIndex: 0,
              layouts: [
                {
                  name: "Default",
                  keys: [
                    { width: 100, height: 100, x: 0, y: 0, r: 0, rx: 0, ry: 0 },
                  ],
                },
              ],
            },
          },
        });
      }
      return Promise.resolve({});
    }
  );
};

describe("PhysicalLayoutSection Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("With Subsystem", () => {
    it("should render layout controls when subsystem is found", async () => {
      mockLayoutResponses();
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <PhysicalLayoutSection />
        </ZMKAppProvider>
      );

      expect(
        screen.getByRole("heading", { name: "Physical Layout" })
      ).toBeInTheDocument();
      expect(
        (await screen.findAllByText(/Primary Trackball/i)).length
      ).toBeGreaterThan(0);
      expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /trackball_sensor \(zmk__trackball\), trackball_button \(zmk__pointing_buttons\)/i
        )
      ).toBeInTheDocument();
      expect(screen.queryByText("Key 0")).not.toBeInTheDocument();
      expect(screen.getAllByText("120 x 120").length).toBeGreaterThan(0);
      expect(
        document.querySelector('g[transform="rotate(15 485 185)"]')
      ).toBeInTheDocument();
    });

    it("should show loaded keyswitch and module counts", async () => {
      mockLayoutResponses();
      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <PhysicalLayoutSection />
        </ZMKAppProvider>
      );

      expect(
        await screen.findByText(/1 keyswitch, 1 module, Default/i)
      ).toBeInTheDocument();
    });

    it("should only auto-load once when subsystem lookup returns a new object", async () => {
      mockLayoutResponses();
      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });
      mockZMKApp.findSubsystem = jest.fn(() => ({
        index: 0,
        identifier: SUBSYSTEM_IDENTIFIER,
        uiUrl: [],
      }));

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <PhysicalLayoutSection />
        </ZMKAppProvider>
      );

      await screen.findByText(/1 keyswitch, 1 module, Default/i);
      await waitFor(() => expect(call_rpc).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(call_rpc).toHaveBeenCalledTimes(2);
    });
  });

  describe("Without Subsystem", () => {
    it("should show warning when subsystem is not found", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <PhysicalLayoutSection />
        </ZMKAppProvider>
      );

      expect(
        screen.getByText(/Subsystem "zmk__physical_layouts" not found/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Make sure your firmware includes the physical layout module/i
        )
      ).toBeInTheDocument();
    });
  });

  describe("Without ZMKAppContext", () => {
    it("should not render when ZMKAppContext is not provided", () => {
      const { container } = render(<PhysicalLayoutSection />);

      expect(container.firstChild).toBeNull();
    });
  });
});
