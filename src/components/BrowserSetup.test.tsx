import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserSetup } from "./BrowserSetup";
import * as api from "../lib/api";

// Mock api methods
vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    detectInstalledBrowsers: vi.fn(),
    setBrowserMonitored: vi.fn(),
  };
});

describe("BrowserSetup Component", () => {
  const mockBrowsers: api.BrowserInfo[] = [
    {
      id: "chrome",
      name: "Google Chrome",
      installed: true,
      exePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      enabled: true,
    },
    {
      id: "brave",
      name: "Brave Browser",
      installed: true,
      exePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      enabled: false,
    },
    {
      id: "edge",
      name: "Microsoft Edge",
      installed: false,
      exePath: undefined,
      enabled: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.detectInstalledBrowsers).mockResolvedValue(mockBrowsers);
    vi.mocked(api.setBrowserMonitored).mockResolvedValue(undefined);
  });

  it("renders browser monitoring setup header and statistics", async () => {
    render(<BrowserSetup />);

    expect(screen.getByText("Cài đặt theo dõi trình duyệt")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("Google Chrome")).toBeDefined();
      expect(screen.getByText("Brave Browser")).toBeDefined();
      expect(screen.getByText("Microsoft Edge")).toBeDefined();
    });

    // Check count
    expect(screen.getByText("2 / 3")).toBeDefined();
  });

  it("shows installed and uninstalled status badges appropriately", async () => {
    render(<BrowserSetup />);

    await waitFor(() => {
      expect(screen.getByText("Google Chrome")).toBeDefined();
    });

    // 2 installed, 1 uninstalled
    const installedBadges = screen.getAllByText("Đã cài đặt");
    expect(installedBadges.length).toBe(2);

    const uninstalledBadges = screen.getAllByText("Chưa cài đặt");
    expect(uninstalledBadges.length).toBe(1);

    // Chrome path is displayed
    expect(
      screen.getByText("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ).toBeDefined();
  });

  it("disables the toggle switch for uninstalled browsers", async () => {
    render(<BrowserSetup />);

    await waitFor(() => {
      expect(screen.getByText("Microsoft Edge")).toBeDefined();
    });

    const edgeSwitch = document.getElementById("switch-browser-edge") as HTMLButtonElement;
    expect(edgeSwitch).toBeDefined();
    expect(edgeSwitch.disabled).toBe(true);
    expect(edgeSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("toggles monitored status and calls setBrowserMonitored for installed browsers", async () => {
    render(<BrowserSetup />);

    await waitFor(() => {
      expect(screen.getByText("Google Chrome")).toBeDefined();
    });

    const chromeSwitch = document.getElementById("switch-browser-chrome") as HTMLButtonElement;
    expect(chromeSwitch).toBeDefined();
    expect(chromeSwitch.getAttribute("aria-checked")).toBe("true");

    // Click to toggle off
    fireEvent.click(chromeSwitch);

    expect(api.setBrowserMonitored).toHaveBeenCalledWith("chrome", false);
    await waitFor(() => {
      expect(chromeSwitch.getAttribute("aria-checked")).toBe("false");
    });
  });

  it("re-scans browsers when refresh button is clicked", async () => {
    render(<BrowserSetup />);

    await waitFor(() => {
      expect(screen.getByText("Google Chrome")).toBeDefined();
    });

    const refreshBtn = document.getElementById("btn-refresh-browsers") as HTMLButtonElement;
    expect(refreshBtn).toBeDefined();

    fireEvent.click(refreshBtn);
    expect(api.detectInstalledBrowsers).toHaveBeenCalledTimes(2);
  });
});
