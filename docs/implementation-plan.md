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

## Phase 1.6 — UX Improvements
- [x] 1.6.1 Detailed distraction breakdown per session on Dashboard (feat(dashboard): show detailed distraction breakdown per session)
- [x] 1.6.2 Running processes picker in SessionSetup blacklist manager (feat(setup): select blacklist apps from running processes list)

## Phase 2 — Browser precision blocking
- [ ] 2.1 WebExtension (Manifest V3) skeleton, Chrome + Firefox
- [ ] 2.2 Native messaging host connecting extension ↔ Tauri app
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
