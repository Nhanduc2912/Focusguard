import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OverlayWarning } from "./OverlayWarning";

type EventHandler = (event: { payload: any }) => void;
const listeners: Record<string, EventHandler[]> = {};

// Mock Tauri invoke & event
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((eventName: string, handler: EventHandler) => {
    if (!listeners[eventName]) {
      listeners[eventName] = [];
    }
    listeners[eventName].push(handler);
    return Promise.resolve(() => {
      const idx = listeners[eventName]?.indexOf(handler);
      if (idx !== undefined && idx >= 0) {
        listeners[eventName].splice(idx, 1);
      }
    });
  }),
}));

function emitTauriEvent(eventName: string, payload: any) {
  const handlers = listeners[eventName] || [];
  handlers.forEach((fn) => fn({ payload }));
}

describe("OverlayWarning Component", () => {
  beforeEach(() => {
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
  });
  it("renders distraction warning title and process name", () => {
    render(
      <OverlayWarning
        initialProcess="notepad.exe"
        initialGoal="Study Algorithms for 60m"
      />
    );

    expect(screen.getByText("Bạn đang xao nhãng!")).toBeDefined();
    expect(screen.getByText("notepad.exe")).toBeDefined();
    expect(screen.getByText("Study Algorithms for 60m")).toBeDefined();
    expect(screen.getByText("Quay lại tập trung")).toBeDefined();
  });

  it("calls onDismiss when clicking 'Quay lại tập trung'", () => {
    const onDismiss = vi.fn();
    render(
      <OverlayWarning
        initialProcess="Steam.exe"
        initialGoal="Work on Project"
        onDismiss={onDismiss}
      />
    );

    const button = screen.getByRole("button", { name: /quay lại tập trung/i });
    fireEvent.click(button);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape key press", () => {
    const onDismiss = vi.fn();
    render(
      <OverlayWarning
        initialProcess="Steam.exe"
        initialGoal="Work on Project"
        onDismiss={onDismiss}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("resets isClosing so overlay container does not stay hidden on repeated triggers", async () => {
    const onDismiss = vi.fn();
    render(
      <OverlayWarning
        initialProcess="notepad.exe"
        initialGoal="Work on Project"
        onDismiss={onDismiss}
      />
    );

    const overlayEl = document.getElementById("distraction-overlay");
    expect(overlayEl).toBeDefined();
    expect(overlayEl?.className).toContain("opacity-100");

    // First dismiss
    const button = screen.getByRole("button", { name: /quay lại tập trung/i });
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // After async hideOverlay resolves, isClosing is reset to false
    await vi.waitFor(() => {
      expect(overlayEl?.className).toContain("opacity-100");
    });

    // Window re-focuses on second distraction
    fireEvent(window, new Event("focus"));
    expect(overlayEl?.className).toContain("opacity-100");
    expect(screen.getByText("Bạn đang xao nhãng!")).toBeDefined();
  });

  it("test_overlay_updates_payload_across_multiple_distinct_triggers", async () => {
    render(<OverlayWarning />);

    // Trigger 1: notepad.exe
    act(() => {
      emitTauriEvent("distraction-detected", {
        sessionId: 1,
        processName: "notepad.exe",
        sessionGoal: "Mục tiêu 1: Học thuật toán",
        timestamp: "2026-09-09T08:00:00.000Z",
      });
    });

    expect(document.getElementById("overlay-process-name")?.textContent).toBe("notepad.exe");
    expect(document.getElementById("overlay-session-goal")?.textContent).toBe("Mục tiêu 1: Học thuật toán");

    // Trigger 2: steam.exe with different goal and timestamp
    act(() => {
      emitTauriEvent("distraction-detected", {
        sessionId: 2,
        processName: "steam.exe",
        sessionGoal: "Mục tiêu 2: Làm dự án FocusGuard",
        timestamp: "2026-09-09T10:15:00.000Z",
      });
    });

    // Assert UI shows the 2nd process and goal, without retaining 1st trigger's stale values
    expect(document.getElementById("overlay-process-name")?.textContent).toBe("steam.exe");
    expect(document.getElementById("overlay-session-goal")?.textContent).toBe("Mục tiêu 2: Làm dự án FocusGuard");
    expect(screen.queryByText("notepad.exe")).toBeNull();
    expect(screen.queryByText("Mục tiêu 1: Học thuật toán")).toBeNull();

    // Verify detection time reflects updated timestamp
    const detectedTimeEl = document.getElementById("overlay-detected-time");
    expect(detectedTimeEl).not.toBeNull();
    expect(detectedTimeEl?.textContent).toContain("Phát hiện lúc:");
  });
});
