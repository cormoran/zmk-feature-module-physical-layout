import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupZMKMocks } from "@cormoran/zmk-studio-react-hook/testing";
import App, { SUBSYSTEM_IDENTIFIER } from "../src/App";
import { Response } from "../src/proto/zmk/physical_layouts/physical_layouts";

type RpcRequest = {
  custom?: unknown;
  keymap?: unknown;
};

// Mock the ZMK client
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/serial", () => ({
  connect: jest.fn(),
}));

describe("App Component", () => {
  describe("Basic Rendering", () => {
    it("should render the application header", () => {
      render(<App />);

      expect(screen.getByText(/Physical Layout Studio/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Keyboard and module geometry/i)
      ).toBeInTheDocument();
    });

    it("should render connection button when disconnected", () => {
      render(<App />);

      expect(screen.getByText(/Connect Serial/i)).toBeInTheDocument();
    });

    it("should render footer", () => {
      render(<App />);

      expect(
        screen.getByText(new RegExp(SUBSYSTEM_IDENTIFIER))
      ).toBeInTheDocument();
    });
  });

  describe("Connection Flow", () => {
    let mocks: ReturnType<typeof setupZMKMocks>;

    beforeEach(() => {
      mocks = setupZMKMocks();
    });

    it("should connect to device when connect button is clicked", async () => {
      mocks.mockSuccessfulConnection({
        deviceName: "Test Keyboard",
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });
      mocks.call_rpc.mockImplementation(
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
                        {
                          width: 100,
                          height: 100,
                          x: 0,
                          y: 0,
                          r: 0,
                          rx: 0,
                          ry: 0,
                        },
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

      const { connect: serial_connect } =
        await import("@zmkfirmware/zmk-studio-ts-client/transport/serial");
      (serial_connect as jest.Mock).mockResolvedValue(mocks.mockTransport);

      render(<App />);

      expect(screen.getByText(/Connect Serial/i)).toBeInTheDocument();

      const user = userEvent.setup();
      const connectButton = screen.getByText(/Connect Serial/i);
      await user.click(connectButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Connected to: Test Keyboard/i)
        ).toBeInTheDocument();
      });

      expect(screen.getByText(/Disconnect/i)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Physical Layout" })
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.getAllByText(/Primary Trackball/i).length
        ).toBeGreaterThan(0);
      });
      expect(screen.queryByText("Key 0")).not.toBeInTheDocument();
    });
  });
});
