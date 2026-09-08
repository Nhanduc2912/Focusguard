import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionSetup } from "./SessionSetup";
import * as api from "../lib/api";

// Mock api module
vi.mock("../lib/api", () => ({
  getActiveSession: vi.fn(),
  getBlacklist: vi.fn(),
  addBlacklistItem: vi.fn(),
  removeBlacklistItem: vi.fn(),
  startSession: vi.fn(),
}));

describe("SessionSetup Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getActiveSession).mockResolvedValue(null);
    vi.mocked(api.getBlacklist).mockResolvedValue([
      { id: 1, name: "facebook.com", itemType: "domain" },
      { id: 2, name: "Steam.exe", itemType: "app" },
    ]);
  });

  it("renders goal input, duration presets, and blacklist items", async () => {
    render(<SessionSetup />);

    expect(screen.getByText("Thiết lập phiên làm việc")).toBeDefined();
    expect(screen.getByPlaceholderText(/Hoàn thành bài giảng/i)).toBeDefined();

    // Verify preset buttons exist
    expect(screen.getByText("15m")).toBeDefined();
    expect(screen.getByText("25m")).toBeDefined();
    expect(screen.getByText("45m")).toBeDefined();
    expect(screen.getByText("60m")).toBeDefined();
    expect(screen.getByText("90m")).toBeDefined();

    // Wait for blacklist items to load
    await waitFor(() => {
      expect(screen.getByText("facebook.com")).toBeDefined();
      expect(screen.getByText("Steam.exe")).toBeDefined();
    });
  });

  it("updates duration when clicking a preset chip", async () => {
    render(<SessionSetup />);

    const preset60 = screen.getByText("60m");
    fireEvent.click(preset60);

    expect(screen.getByText(/Đã chọn:/i).textContent).toContain("60");
  });

  it("updates duration using stepper +/- buttons", async () => {
    render(<SessionSetup />);

    const plusBtn = screen.getByTitle("Tăng 5 phút");
    fireEvent.click(plusBtn);

    // Initial was 25 -> 25 + 5 = 30
    expect(screen.getByText(/Đã chọn:/i).textContent).toContain("30");

    const minusBtn = screen.getByTitle("Giảm 5 phút");
    fireEvent.click(minusBtn);
    expect(screen.getByText(/Đã chọn:/i).textContent).toContain("25");
  });

  it("adds a new item to blacklist", async () => {
    vi.mocked(api.addBlacklistItem).mockResolvedValue({
      id: 3,
      name: "notepad.exe",
      itemType: "app",
    });

    render(<SessionSetup />);

    await waitFor(() => {
      expect(screen.getByText("facebook.com")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/Thêm tiến trình/i);
    fireEvent.change(input, { target: { value: "notepad.exe" } });

    const addBtn = screen.getByRole("button", { name: /Thêm/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(api.addBlacklistItem).toHaveBeenCalledWith("notepad.exe", "app");
      expect(screen.getByText("notepad.exe")).toBeDefined();
    });
  });

  it("removes an item from blacklist", async () => {
    vi.mocked(api.removeBlacklistItem).mockResolvedValue(true);

    render(<SessionSetup />);

    await waitFor(() => {
      expect(screen.getByText("facebook.com")).toBeDefined();
    });

    const deleteBtn = screen.getByTitle("Xóa facebook.com");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.removeBlacklistItem).toHaveBeenCalledWith(1);
      expect(screen.queryByText("facebook.com")).toBeNull();
    });
  });

  it("submits the form and calls startSession with goal and duration", async () => {
    const onSessionStarted = vi.fn();
    vi.mocked(api.startSession).mockResolvedValue({
      id: 42,
      goal: "Study Mathematics",
      plannedMinutes: 45,
      startedAt: "2026-09-08T12:00:00Z",
    });

    render(<SessionSetup onSessionStarted={onSessionStarted} />);

    // Select 45m preset
    fireEvent.click(screen.getByText("45m"));

    // Enter goal
    const goalInput = screen.getByPlaceholderText(/Hoàn thành bài giảng/i);
    fireEvent.change(goalInput, { target: { value: "Study Mathematics" } });

    // Click Start button
    const submitBtn = screen.getByRole("button", { name: /Bắt đầu phiên tập trung/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.startSession).toHaveBeenCalledWith("Study Mathematics", 45);
      expect(onSessionStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 42,
          goal: "Study Mathematics",
          plannedMinutes: 45,
        })
      );
    });
  });
});
