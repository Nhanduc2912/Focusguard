# AGENTS.md — Project Rules for AI Coding Agents
# Read automatically by Antigravity (.agents/AGENTS.md), and compatible with
# Cursor / Claude Code. Antigravity-specific overrides live in GEMINI.md.

## Project Overview
- **Name:** FocusGuard
- **Type:** Open-source desktop app (Tauri) that helps users stop getting
  distracted (games, social media) during self-set focus sessions.
- **Stage:** Prototype → MVP
- **License:** MIT

## Problem Statement
User sets a focus goal (e.g. "watch this YouTube lecture for 60 min").
While the session is active, the app detects when the user switches to a
blacklisted app or website (games, Facebook, TikTok...) and intervenes
(warning overlay, friction, logging) instead of silently letting it happen.

## Tech Stack (do not deviate without updating this file)
- **Core / backend logic:** Rust (Tauri v2)
- **Frontend UI:** React + TypeScript, Vite
- **Styling:** Tailwind CSS
- **Local storage:** SQLite (via `rusqlite` or `sqlx`), local-first, no
  mandatory account
- **Process/window monitoring:** `sysinfo` crate (cross-platform base) +
  platform-specific foreground-window APIs (`windows` crate on Windows,
  `NSWorkspace` via `objc2` bindings on macOS)
- **Browser blocking (Phase 2, not in MVP):** WebExtension (Manifest V3) +
  Tauri native messaging host
- **Testing:** `cargo test` for Rust core, `vitest` for React UI
- **Package manager:** pnpm (frontend), cargo (backend)

## Architecture
```
/src-tauri/
  src/
    process_monitor.rs   # polls active process/window, matches against blacklist
    blocking_engine.rs   # decides action: warn / overlay / log
    db.rs                # SQLite schema + queries (sessions, distractions, blacklist)
    commands.rs          # Tauri commands exposed to frontend
    main.rs
/src/                    # React frontend
  components/
    SessionSetup.tsx     # create focus session: goal, duration, blacklist
    SessionTimer.tsx     # active session view, timer, live distraction count
    OverlayWarning.tsx   # full-screen intervention shown on distraction
    Dashboard.tsx         # history: streaks, total focus time, distraction stats
  lib/api.ts             # typed wrappers around Tauri invoke()
docs/
  implementation-plan.md  # phased roadmap agent must follow, checkbox tracked
  verification-log.md     # agent appends self-verification results here
```

## MVP Scope (Phase 1 — build this first, nothing from Phase 2/3)
1. Create a focus session: goal text, duration (minutes), blacklist (built-in
   presets: common games/launchers, Facebook, TikTok, YouTube-general domain
   as a coarse block — refine per-URL blocking is Phase 2, skip it now).
2. Timer runs in the background (Rust side), independent of window focus.
3. Poll active process/foreground window every 1–2s. If it matches the
   blacklist while a session is active → trigger `blocking_engine`:
   - Show a full-screen overlay window (always-on-top) with the session
     goal and a "go back to focus" button.
   - Increment a distraction counter for this session in SQLite.
4. On session end: show a summary (planned vs actual focus time, number of
   distractions) and persist it.
5. Simple dashboard: list of past sessions with duration + distraction count.

Out of scope for MVP: browser extension, per-video YouTube whitelisting,
cloud sync, gamification, mobile. Do not implement these yet even if easy —
follow `docs/implementation-plan.md` phase order strictly.

## Coding Conventions
- Max file length: ~300 lines; split into modules beyond that.
- Rust: `cargo clippy` must pass with no warnings before a task is marked done.
- TypeScript: strict mode on; no `any` without a comment justifying it.
- No telemetry, no network calls except the optional (disabled by default)
  sync feature — this is a privacy-first app, that's a selling point.
- Every new Tauri command must have a matching Rust unit test where logic is
  non-trivial (e.g. blacklist matching, streak calculation).
- Commit style: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`).

## Definition of Done (per task)
A task is NOT done until:
1. Code compiles (`cargo build` / `pnpm build`) with no errors.
2. Relevant tests pass (`cargo test`, `pnpm test`).
3. The agent has run the app, exercised the feature (e.g. actually opened a
   blacklisted process and confirmed the overlay fires), and captured a
   screenshot as proof — logged to `docs/verification-log.md`.
4. `docs/implementation-plan.md` checkbox for that item is ticked.

## Workflow for the Agent
1. Read `docs/implementation-plan.md` fully before starting.
2. Use Planning Mode for anything touching more than one file; produce an
   implementation plan artifact before writing code.
3. Work phase by phase, task by task — do not jump ahead to later phases.
4. After each task: self-verify per "Definition of Done" above, then move on.
5. If a design decision isn't covered here, choose the option most aligned
   with "local-first, privacy-first, minimal dependencies" and note the
   assumption in `docs/implementation-plan.md`.

See `.agents/skills/` for detailed how-to guides on scaffolding, process
monitoring implementation, and the self-verification procedure.
