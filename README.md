# FocusGuard

> Open-source desktop app (Tauri v2 + React) that helps users stay focused and avoid digital distractions during self-set focus sessions.

FocusGuard monitors foreground windows during active focus sessions. When a blacklisted app or game is opened, FocusGuard intervenes with an always-on-top warning overlay, adds friction, and logs distraction statistics — completely local-first and privacy-first.

---

## Features

- **Local-First Focus Sessions**: Configure session goal, planned duration, and active blacklist.
- **Background OS Polling**: Independent Rust poller continuously tracks foreground processes.
- **Intervention Warning Overlay**: Immediate friction when navigating away to blacklisted games or apps.
- **Privacy First**: 100% offline, local SQLite database (`sessions`, `distractions`, `blacklist`). No telemetry.

---

## Tech Stack

- **Desktop Framework**: [Tauri v2](https://v2.tauri.app/)
- **Core Backend**: Rust (`rusqlite`, `sysinfo`, `windows-rs`, `tokio`)
- **Frontend UI**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Testing**: `cargo test` (Rust), `vitest` (Frontend)
- **Package Manager**: pnpm (frontend), cargo (backend)

---

## Getting Started

### Prerequisites
- Node.js (v18+) & `pnpm`
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Visual Studio 2022 C++ Build Tools & Windows SDK

### Development

```bash
# 1. Install frontend dependencies
pnpm install

# 2. Run frontend tests
pnpm test

# 3. Run backend tests
cd src-tauri && cargo test

# 4. Start Tauri development server
pnpm tauri dev
```

---

## License

[MIT License](LICENSE)
