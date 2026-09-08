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
});
