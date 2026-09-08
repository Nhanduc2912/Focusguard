import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Dashboard } from "./Dashboard";
import * as api from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    getHistory: vi.fn(),
  };
});

describe("Dashboard Component", () => {
  const mockHistory: api.SessionWithStats[] = [
    {
      id: 1,
      goal: "Lập trình hệ thống với Rust",
      plannedMinutes: 25,
      startedAt: "2026-09-09T00:00:00Z",
      endedAt: "2026-09-09T00:25:00Z",
      distractionCount: 0,
    },
    {
      id: 2,
      goal: "Thiết kế giao diện Dashboard",
      plannedMinutes: 30,
      startedAt: "2026-09-09T01:00:00Z",
      endedAt: "2026-09-09T01:30:00Z",
      distractionCount: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when history returns empty array", async () => {
    vi.mocked(api.getHistory).mockResolvedValue([]);
    const onStart = vi.fn();
    render(<Dashboard onStartNewSession={onStart} />);

    await waitFor(() => {
      expect(screen.getByText("Chưa có phiên nào")).toBeDefined();
    });

    const newBtn = screen.getByText("Khởi tạo phiên mới");
    fireEvent.click(newBtn);
    expect(onStart).toHaveBeenCalled();
  });

  it("renders aggregate statistics and session list rows", async () => {
    vi.mocked(api.getHistory).mockResolvedValue(mockHistory);
    render(<Dashboard onStartNewSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Lập trình hệ thống với Rust")).toBeDefined();
      expect(screen.getByText("Thiết kế giao diện Dashboard")).toBeDefined();
    });

    // Check stats: 2 sessions, total time (25m + 30m = 55m), clean rate 50%, distractions 2
    const totalSessionsEl = document.getElementById("stat-total-sessions");
    expect(totalSessionsEl?.textContent).toBe("2");

    const cleanRateEl = document.getElementById("stat-clean-rate");
    expect(cleanRateEl?.textContent).toBe("50%");

    const distractionsEl = document.getElementById("stat-total-distractions");
    expect(distractionsEl?.textContent).toBe("2");

    // Check badges
    expect(screen.getByText("0 xao nhãng")).toBeDefined();
    expect(screen.getByText("2 xao nhãng")).toBeDefined();
  });

  it("calls getHistory again when clicking refresh button", async () => {
    vi.mocked(api.getHistory).mockResolvedValue(mockHistory);
    render(<Dashboard onStartNewSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Lập trình hệ thống với Rust")).toBeDefined();
    });

    const refreshBtn = screen.getByTitle("Làm mới dữ liệu lịch sử");
    fireEvent.click(refreshBtn);

    expect(api.getHistory).toHaveBeenCalledTimes(2);
  });
});
