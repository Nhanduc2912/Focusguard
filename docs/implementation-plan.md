# FocusGuard — Implementation Plan

Agent: follow phase order strictly. Do not start a phase until every task in
the previous phase is verified PASS (see `.agents/skills/testing-verification`).

## Phase 1 — MVP (desktop, local-only)
- [x] 1.1 Scaffold Tauri + React + Tailwind project (`.agents/skills/tauri-scaffold`)
- [x] 1.2 SQLite schema: `sessions(id, goal, planned_minutes, started_at, ended_at)`,
      `distractions(id, session_id, process_name, timestamp)`,
      `blacklist(id, name, type)`
- [x] 1.3 Tauri commands: `start_session`, `end_session`, `get_history`,
      `add_blacklist_item`, `remove_blacklist_item`
- [x] 1.4 Rust background poller (process/window monitor, 1–2s interval)
- [x] 1.5 Blacklist matching logic + unit tests (Đã hoàn thành trong phạm vi Task 1.4: matches_blacklist + test_blacklist_process_matching)
- [x] 1.6 Overlay window (always-on-top, full-screen) triggered on distraction
- [x] 1.7 Frontend: SessionSetup screen (goal, duration, blacklist picker)
- [x] 1.8 Frontend: SessionTimer screen (live countdown, live distraction count)
- [x] 1.9 Frontend: session summary on end (planned vs actual, distractions)
- [x] 1.10 Frontend: Dashboard listing past sessions
- [x] 1.11 End-to-end self-verification per skill, using Notepad/TextEdit as
      the test blacklist target
- [x] 1.12 Write `README.md` with build/run instructions and screenshots

## Phase 1.5 — Critical bug fixes
- [x] 1.5.1 Fix blank overlay window on repeated distraction triggers (fix(overlay): resolve blank overlay on repeated distraction trigger)
- [x] 1.5.2 Auto-end session, focus main window, and play sound when countdown reaches zero (fix(timer): auto-end session and notify when countdown reaches zero)
- [x] 1.5.3 Fix stale overlay payload shown across repeated distraction triggers (fix(overlay): resolve stale payload shown across repeated distraction triggers)

## Phase 1.6 — UX Improvements
- [x] 1.6.1 Detailed distraction breakdown per session on Dashboard (feat(dashboard): show detailed distraction breakdown per session)
- [x] 1.6.2 Running processes picker in SessionSetup blacklist manager (feat(setup): select blacklist apps from running processes list)

## Known limitations / bàn giao Phase 1
- **Phạm vi giám sát:** Phase 1 tập trung hoàn toàn vào giám sát cấp hệ điều hành (OS-level process monitoring qua `GetForegroundWindow` / `sysinfo`) đối với các ứng dụng desktop (`.exe`, game, Steam, launcher, Discord, v.v.).
- **Giới hạn trình duyệt (Chưa có trong Phase 1):** Phase 1 **CHƯA** chặn được URL cụ thể hoặc từng tab riêng lẻ bên trong trình duyệt (ví dụ: chưa thể phân biệt video học tập trên YouTube với video giải trí, hoặc xem URL bài viết Facebook). Việc chặn web hiện tại ở Phase 1 chỉ dừng ở mức chặn thô (coarse blocking) theo tên tiến trình hoặc tiêu đề cửa sổ trình duyệt.
- **Bàn giao sang Phase 2:** Tính năng bóc tách từng tab, chặn URL chính xác (chặn hoàn toàn `facebook.com`, `tiktok.com`; whitelist duy nhất video/playlist YouTube chỉ định cho phiên) sẽ được thực hiện thông qua WebExtension (Manifest V3) và Native Messaging Host trong Phase 2.

## Phase 2 — Browser precision blocking
- [x] 2.0 Browser Setup screen: detect installed browsers (Chrome/Brave/Edge) and let user select which to monitor (monitored_browsers table)
- [x] 2.1 Native messaging host mode: stdio protocol (4-byte LE framing + JSON UTF-8), --native-host flag, SQLite reuse
- [ ] 2.2 WebExtension (Manifest V3) skeleton & registry registration (Chrome/Edge/Brave/Firefox)
- [ ] 2.3 Per-tab URL matching (block facebook.com/tiktok.com fully; on
      YouTube, allow only a whitelisted video/playlist id set at session start)
- [ ] 2.4 Extension UI: shows current session status, "locked video" indicator

## Phase 3 — Retention & polish
- [ ] 3.1 Streaks + basic stats charts on Dashboard
- [ ] 3.2 "Strict mode": disable early session termination for first N minutes
- [ ] 3.3 Optional sync via self-hostable Supabase (off by default)
- [ ] 3.4 Packaging: signed installers for Windows/macOS, auto-update

## Notes / assumptions log
(Agent: append any assumption you had to make here, with date and reasoning.)
