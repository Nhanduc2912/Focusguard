---
name: testing-verification
description: Use this before marking ANY task in docs/implementation-plan.md as done. Defines the mandatory self-verification loop.
---
# Self-Verification Procedure

Do not mark a task complete based on "the code looks right." Every task must
pass through this loop:

## 1. Automated checks
```bash
cd src-tauri && cargo clippy -- -D warnings && cargo test
cd .. && pnpm test
```
All must exit 0. If not, fix and re-run — do not proceed.

## 2. Runtime check
```bash
pnpm tauri dev # hoặc pnpm dev khi verify frontend UI
```

> [!IMPORTANT]
> **Phương án xác minh trực quan mặc định:**
> Browser Subagent mặc định (Playwright) bị chặn tải driver trên máy này (lỗi 404 remote CDN). Do đó, **MCP `chrome-devtools` là công cụ xác minh trực quan mặc định cho mọi task còn lại**:
> - Mở URL (ví dụ `http://localhost:1420`) bằng tool `new_page` của MCP `chrome-devtools`.
> - Kiểm tra console không có lỗi runtime bằng tool `list_console_messages`.
> - Chụp screenshot bằng tool `take_screenshot` với tham số `filePath: "f:/focusguard/docs/<screenshot-name>.png"` và `fullPage: true`.
> - Thao tác UI (click, fill, evaluate_script) thông qua các tool của MCP `chrome-devtools`.
> - Xác nhận luồng giao diện thực tế (Session Setup, Timer countdown, Warning Overlay, Dashboard...).

## 3. Log the result
Append one line to `docs/verification-log.md`:
```
- [YYYY-MM-DD] [Phase 1 / Task 3: overlay trigger] PASS — screenshot: overlay-trigger-01.png
```
If it fails, log FAIL with the reason, fix the issue, and re-verify before
moving to the next task — per Strict Mode in GEMINI.md, do not skip ahead
with a known failure.

## 4. Update the plan
Tick the corresponding checkbox in `docs/implementation-plan.md` only after
step 3 shows PASS.

## What counts as sufficient evidence
- A screenshot showing the actual UI state (not just "no errors in console").
- For background/non-visual logic (e.g. streak calculation, SQLite writes):
  a passing unit test PLUS one manual run where you print/query the DB and
  confirm the row exists with the correct values.
