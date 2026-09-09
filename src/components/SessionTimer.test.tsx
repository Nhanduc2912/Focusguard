import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionTimer } from "./SessionTimer";
import * as api from "../lib/api";

type EventCallback = (event: { payload: api.DistractionEventPayload }) => void;
let eventCallback: EventCallback | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_event: string, callback: EventCallback) => {
    eventCallback = callback;
    return Promise.resolve(() => {
      eventCallback = null;
    });
  }),
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    endSession: vi.fn(),
    getHistory: vi.fn(),
    showMainWindow: vi.fn().mockResolvedValue(undefined),
  };
});

describe("SessionTimer Component", () => {
  const mockSession: api.Session = {
    id: 42,
    goal: "Nghiên cứu giải thuật đồ thị",
    plannedMinutes: 25,
    startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // started 5 mins ago
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventCallback = null;
    vi.mocked(api.getHistory).mockResolvedValue([
      {
        ...mockSession,
        distractionCount: 2,
      },
    ]);
    vi.mocked(api.endSession).mockResolvedValue({
      ...mockSession,
      endedAt: new Date().toISOString(),
    });
  });

  it("renders empty state when session is null", () => {
    const onNavigate = vi.fn();
    render(<SessionTimer session={null} onNavigateToSetup={onNavigate} />);

    expect(screen.getByText("Chưa có phiên hoạt động")).toBeDefined();
    const btn = screen.getByText("Thiết lập phiên mới");
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalled();
  });

  it("renders active session goal and initial countdown", async () => {
    render(<SessionTimer session={mockSession} />);

    expect(screen.getByText("Nghiên cứu giải thuật đồ thị")).toBeDefined();
    expect(screen.getByText("Phiên #42")).toBeDefined();
    expect(screen.getByText(/25 phút/)).toBeDefined();
    expect(screen.getByText("Đang bảo vệ")).toBeDefined();

    // Since it started 5 mins ago (20 mins left of 25m), timer display should show ~20:00 or 19:59
    const timerDisplay = document.getElementById("timer-display");
    expect(timerDisplay).toBeDefined();
    expect(timerDisplay?.textContent).toMatch(/^(19|20):[0-5][0-9]$/);
  });

  it("loads and displays initial distraction count from history", async () => {
    render(<SessionTimer session={mockSession} />);

    await waitFor(() => {
      const countEl = document.getElementById("distraction-count-display");
      expect(countEl?.textContent).toBe("2");
    });
  });

  it("increments distraction count when receiving distraction-detected event", async () => {
    render(<SessionTimer session={mockSession} />);

    await waitFor(() => {
      const countEl = document.getElementById("distraction-count-display");
      expect(countEl?.textContent).toBe("2");
    });

    // Simulate distraction event from Tauri backend
    act(() => {
      if (eventCallback) {
        eventCallback({
          payload: {
            sessionId: 42,
            processName: "Steam.exe",
            sessionGoal: "Nghiên cứu giải thuật đồ thị",
          },
        });
      }
    });

    await waitFor(() => {
      const countEl = document.getElementById("distraction-count-display");
      expect(countEl?.textContent).toBe("3");
    });
  });

  it("ignores distraction events for other session IDs", async () => {
    render(<SessionTimer session={mockSession} />);

    await waitFor(() => {
      const countEl = document.getElementById("distraction-count-display");
      expect(countEl?.textContent).toBe("2");
    });

    // Event for session 999 (different session)
    act(() => {
      if (eventCallback) {
        eventCallback({
          payload: {
            sessionId: 999,
            processName: "notepad.exe",
            sessionGoal: "Other Goal",
          },
        });
      }
    });

    const countEl = document.getElementById("distraction-count-display");
    expect(countEl?.textContent).toBe("2");
  });

  it("handles end session flow with confirmation", async () => {
    const onEnded = vi.fn();
    render(<SessionTimer session={mockSession} onSessionEnded={onEnded} />);

    const endBtn = screen.getByText("Kết thúc phiên");
    act(() => {
      fireEvent.click(endBtn);
    });

    // Confirmation prompt appears
    expect(screen.getByText("Kết thúc sớm?")).toBeDefined();
    const confirmBtn = screen.getByText("Đồng ý");

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(api.endSession).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalled();
  });

  it("auto-ends session and invokes onSessionEnded when countdown reaches zero", async () => {
    const onEnded = vi.fn();
    const expiredSession: api.Session = {
      id: 99,
      goal: "1-minute quick test",
      plannedMinutes: 1,
      startedAt: new Date(Date.now() - 65 * 1000).toISOString(), // started 65s ago (> 60s)
    };

    render(<SessionTimer session={expiredSession} onSessionEnded={onEnded} />);

    await waitFor(() => {
      expect(api.endSession).toHaveBeenCalled();
      expect(api.showMainWindow).toHaveBeenCalled();
      expect(onEnded).toHaveBeenCalled();
    });
  });
});
