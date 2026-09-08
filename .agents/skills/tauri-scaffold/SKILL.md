---
name: tauri-scaffold
description: Use this when initializing the FocusGuard project structure for the first time, or when adding a new Tauri command that needs to be wired between Rust and the React frontend.
---
# Tauri + React Scaffold

## Initial setup
```bash
pnpm create tauri-app@latest focusguard --template react-ts
cd focusguard
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
```

Enable required Tauri plugins in `src-tauri/Cargo.toml`:
- `tauri-plugin-sql` (SQLite) OR plain `rusqlite` if you need custom queries
  beyond the plugin's scope (this project needs custom queries — prefer
  `rusqlite` behind a small `db.rs` wrapper).
- `sysinfo` for cross-platform process enumeration.
- Windows only: `windows` crate with `Win32_UI_WindowsAndMessaging` and
  `Win32_System_ProcessStatus` features, for foreground window + exe path.

## Wiring a new command (pattern to follow every time)
1. Define the Rust function in the relevant module (e.g. `commands.rs`),
   annotated `#[tauri::command]`.
2. Register it in the `tauri::generate_handler![...]` list in `main.rs`.
3. Add a typed wrapper in `src/lib/api.ts`:
   ```ts
   import { invoke } from "@tauri-apps/api/core";
   export async function startSession(goal: string, minutes: number) {
     return invoke<Session>("start_session", { goal, minutes });
   }
   ```
4. Never call `invoke` directly from a component — always go through
   `lib/api.ts` so types stay centralized.

## Background timer / polling
Do the process-polling loop in Rust using `tokio::time::interval`, spawned
as a background task from `main.rs` setup, NOT on the frontend with
`setInterval` — the frontend can be closed/hidden but the monitoring must
keep running.
