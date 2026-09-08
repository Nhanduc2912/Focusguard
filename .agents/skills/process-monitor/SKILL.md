
---
name: process-monitor
description: Use this when implementing or modifying process_monitor.rs or blocking_engine.rs — the core distraction-detection logic.
---
# Process & Window Monitoring

## Goal
Every 1–2 seconds while a session is active, determine which app/process is
currently in the foreground and check it against the session's blacklist.

## Windows implementation
```rust
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};

// 1. GetForegroundWindow() -> HWND
// 2. GetWindowThreadProcessId(hwnd) -> process id
// 3. OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
// 4. GetModuleBaseNameW(handle) -> exe name, e.g. "chrome.exe", "LeagueClient.exe"
```

## macOS implementation
Use `NSWorkspace.shared().frontmostApplication` (via `objc2-app-kit` or a
small Swift/Obj-C shim called from Rust) to get the bundle identifier of the
frontmost app, e.g. `com.valvesoftware.steam`.

## Matching logic (`blocking_engine.rs`)
- Blacklist entries are simple strings: process/exe names for apps
  (`"LeagueClient.exe"`) and bare domains for the coarse website block
  (`"facebook.com"`) — MVP does NOT parse browser tab URLs, just flags when
  the active window belongs to a known browser AND that browser's window
  title contains a blacklisted keyword (best-effort heuristic for MVP; real
  per-tab detection is Phase 2 via the browser extension).
- On match: call `trigger_overlay(reason: &str)` and
  `db::log_distraction(session_id, process_name)`.
- Debounce: do not re-trigger the overlay more than once per 5 seconds for
  the same ongoing distraction, but DO keep counting time-in-distraction if
  you want a "time wasted" metric later.

## Unit tests required
- `blacklist_matches("leagueclient.exe", &blacklist) == true`
- `blacklist_matches("code.exe", &blacklist) == false`
- Debounce logic: two triggers within 5s → only one overlay event recorded.

## Self-test procedure (manual, run by the agent)
1. Start a session with `notepad.exe` (Windows) or `TextEdit` (macOS) added
   to the blacklist as a stand-in test target (safe, always available, no
   need to install a real game).
2. Launch that app while the session is running.
3. Confirm the overlay appears within ~2s and the distraction count in the
   DB increments.
4. Screenshot the overlay via the Browser Subagent / OS screenshot and save
   the result per `testing-verification` skill.
