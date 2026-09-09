import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OverlayWarning } from "./OverlayWarning";

// Mock Tauri invoke & event
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("OverlayWarning Component", () => {
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
});
