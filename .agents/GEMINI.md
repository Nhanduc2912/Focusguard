# GEMINI.md — Antigravity-specific configuration
# Applies on top of AGENTS.md (additive, does not replace it).

## Model
- Preferred model: `gemini-3.8-flash` (High reasoning effort)
- Rationale: this project is long-horizon (multi-file Rust + React,
  background OS polling, self-verification loop) but each individual task is
  well-scoped — Flash-High gives enough reasoning depth for correctness
  while staying fast/cheap for iterative build-test-fix loops.
- Fallback if a task repeatedly fails self-verification 3+ times: escalate to
  `gemini-3.1-pro` for that specific task only, then return to Flash.

## Agent Mode
- Use **Planning Mode** for all tasks in `docs/implementation-plan.md`
  (multi-file, requires design decisions).
- Use **Fast Mode** only for trivial fixes (typo, single-line bug) discovered
  during verification.
- Enable **Task Groups**: one group per Phase (Phase 1 MVP, Phase 2 browser
  extension, Phase 3 gamification/sync). Do not start a group until the
  previous one's tasks are all verified done.

## Permissions
- File read/write: unrestricted within the repo root.
- Terminal execution: allowed for `cargo build`, `cargo test`, `cargo clippy`,
  `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test`.
- Do NOT run destructive terminal commands (`rm -rf`, force-push, global
  package installs) without explicit confirmation.
- Browser Subagent: allowed and required — used to launch the running Tauri
  app's dev window and visually confirm the overlay/timer UI, and to capture
  screenshots for the verification log.
- Network access: none needed for MVP (fully local). Do not add network
  calls without updating AGENTS.md first.

## Sandboxing
- Enabled. Process-monitoring code that queries the OS process list should
  still be tested inside the sandbox where possible; if the sandbox blocks
  the specific OS API needed (e.g. foreground window handle), note this in
  `docs/verification-log.md` and fall back to a manual verification note
  instead of failing the whole task silently.

## Verification / Artifacts requirements
For every Phase 1 task, produce these Antigravity artifacts before marking
the task complete:
1. **Implementation Plan** — brief plan artifact before coding starts.
2. **Task List** — checklist matching `docs/implementation-plan.md` items.
3. **Walkthrough** — short summary of what changed and why, at task end.
4. **Screenshot / Browser Recording** — actual proof the feature works
   (e.g. overlay appearing when a blacklisted test process is launched),
   attached via the Browser Subagent.
5. Append a one-line entry to `docs/verification-log.md`:
   `[date] [task] [pass/fail] [artifact link or note]`

## Strict Mode
Enable Strict Mode: the agent must not silently skip a failing test or
mocked-out feature — a failing verification step blocks marking the task
done and must be surfaced to the human reviewer instead.
