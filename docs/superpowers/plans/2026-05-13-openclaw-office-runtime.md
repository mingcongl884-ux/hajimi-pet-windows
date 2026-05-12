# OpenClaw Office Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route normal office mode through the bundled OpenClaw agent runtime while trimming low-risk packaged OpenClaw documentation files.

**Architecture:** Add a focused OpenClaw office runner that writes a HaJiMi-owned OpenClaw config under app user data, invokes the bundled `openclaw agent --local --json`, and converts the result back to the existing `ChatResponse` shape. Keep the existing hand-written agent as a fallback for runtime-unavailable failures, and prune non-runtime docs/changelogs during `afterPack`.

**Tech Stack:** Electron main process, Node child processes, OpenClaw CLI, Vitest, electron-builder `afterPack`.

---

### Task 1: OpenClaw Runner

**Files:**
- Create: `electron/openClawAgentClient.ts`
- Modify: `electron/main.ts`
- Test: `tests/openClawAgentClient.test.ts`

- [ ] Write tests proving the runner writes a config with a custom OpenAI-compatible provider, passes the API key through env instead of writing it to disk, invokes `agent --local --json`, and parses JSON payloads.
- [ ] Implement `runOpenClawAgentTask` with injectable spawn/state-dir options.
- [ ] Switch ordinary office mode in `electron/main.ts` to `runOpenClawAgentTask`, keeping the legacy runner only as fallback when OpenClaw cannot start.

### Task 2: Package Size Trim

**Files:**
- Modify: `scripts/after-pack.cjs`
- Test: `tests/afterPack.test.ts`

- [ ] Add a test for pruning OpenClaw docs/changelog from a packaged app directory without touching `dist/`, `openclaw.mjs`, or plugin runtime files.
- [ ] Implement a small exported pruning helper and call it from `afterPack`.

### Task 3: Verification

**Files:**
- Verify all changed code.

- [ ] Run targeted tests for OpenClaw runner and package pruning.
- [ ] Run the full test suite.
- [ ] Run the production build.
