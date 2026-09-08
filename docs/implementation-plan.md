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
- [ ] 1.5 Blacklist matching logic + unit tests
- [ ] 1.6 Overlay window (always-on-top, full-screen) triggered on distraction
- [ ] 1.7 Frontend: SessionSetup screen (goal, duration, blacklist picker)
- [ ] 1.8 Frontend: SessionTimer screen (live countdown, live distraction count)
- [ ] 1.9 Frontend: session summary on end (planned vs actual, distractions)
- [ ] 1.10 Frontend: Dashboard listing past sessions
- [ ] 1.11 End-to-end self-verification per skill, using Notepad/TextEdit as
      the test blacklist target
- [ ] 1.12 Write `README.md` with build/run instructions and screenshots

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
