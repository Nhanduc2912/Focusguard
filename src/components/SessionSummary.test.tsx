import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionSummary } from "./SessionSummary";
import { SessionWithStats } from "../lib/api";

describe("SessionSummary Component", () => {
  const perfectSession: SessionWithStats = {
    id: 101,
    goal: "Lập trình tính năng SessionSummary",
    plannedMinutes: 25,
    startedAt: "2026-09-09T00:00:00Z",
    endedAt: "2026-09-09T00:24:50Z",
    distractionCount: 0,
  };

  const distractedSession: SessionWithStats = {
    id: 102,
    goal: "Đọc tài liệu kiến trúc phần mềm",
    plannedMinutes: 45,
    startedAt: "2026-09-09T01:00:00Z",
    endedAt: "2026-09-09T01:30:00Z",
    distractionCount: 3,
  };

  it("renders goal, planned duration and actual duration for a perfect session", () => {
    render(
      <SessionSummary
        session={perfectSession}
        onStartNewSession={vi.fn()}
        onViewHistory={vi.fn()}
      />
    );

    expect(screen.getByText("Lập trình tính năng SessionSummary", { exact: false })).toBeDefined();
    expect(screen.getByText(/25/)).toBeDefined();
    expect(screen.getByText("Tuyệt đối tập trung (100% Focus)")).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
    expect(screen.getByText("Hoàn toàn sạch xao nhãng")).toBeDefined();
  });

  it("renders distraction metrics when distractionCount > 0", () => {
    render(
      <SessionSummary
        session={distractedSession}
        onStartNewSession={vi.fn()}
        onViewHistory={vi.fn()}
      />
    );

    expect(screen.getByText("Đọc tài liệu kiến trúc phần mềm", { exact: false })).toBeDefined();
    expect(screen.getByText("Phiên đã hoàn tất")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText(/vượt qua 3 lần thử thách xao nhãng/)).toBeDefined();
  });

  it("invokes onStartNewSession when clicking new session button", () => {
    const onStartNew = vi.fn();
    render(
      <SessionSummary
        session={perfectSession}
        onStartNewSession={onStartNew}
        onViewHistory={vi.fn()}
      />
    );

    const btn = screen.getByText("Thiết lập phiên mới");
    fireEvent.click(btn);
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });

  it("invokes onViewHistory when clicking view history button", () => {
    const onViewHist = vi.fn();
    render(
      <SessionSummary
        session={perfectSession}
        onStartNewSession={vi.fn()}
        onViewHistory={onViewHist}
      />
    );

    const btn = screen.getByText("Xem lịch sử phiên");
    fireEvent.click(btn);
    expect(onViewHist).toHaveBeenCalledTimes(1);
  });
});
