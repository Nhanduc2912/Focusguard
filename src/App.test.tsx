import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./lib/api", () => ({
  ping: vi.fn().mockResolvedValue("Backend connected (Tauri v2 + Rust)"),
  getActiveSession: vi.fn().mockResolvedValue(null),
  getBlacklist: vi.fn().mockResolvedValue([]),
  startSession: vi.fn(),
  endSession: vi.fn(),
  addBlacklistItem: vi.fn(),
  removeBlacklistItem: vi.fn(),
  hideOverlay: vi.fn(),
  getHistory: vi.fn().mockResolvedValue([]),
}));

describe("FocusGuard App Shell", () => {
  it("renders the app title and navigation tabs", async () => {
    render(<App />);
    expect(screen.getByText("FocusGuard")).toBeDefined();
    expect(screen.getByText("Session Setup")).toBeDefined();
    expect(screen.getByText("Active Session")).toBeDefined();
    expect(screen.getByText("Past History")).toBeDefined();
    expect(await screen.findByText("Backend connected (Tauri v2 + Rust)")).toBeDefined();
  });
});
