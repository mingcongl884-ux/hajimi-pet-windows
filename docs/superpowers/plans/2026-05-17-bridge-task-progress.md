# Bridge and Task Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make office work feel Codex-like while keeping the bridge compact: inline task progress, clear cancel/retry/output behavior, and one small bridge area that shows local, LAN, and relay targets without clutter.

**Architecture:** Keep the current Codex-style office shell, but tighten the state model so the renderer always knows whether it is showing a casual chat, an active work task, or a remote execution target. The main process remains responsible for bridge connectivity and execution routing; the renderer only shows a compact summary and task chrome. No new full-page admin view.

**Tech Stack:** Electron, React, TypeScript, Vitest, CSS.

---

### Task 1: Codex-style task progress and message chrome

**Files:**
- Modify: `src/lib/taskCards.ts`
- Modify: `src/lib/officeTaskState.ts`
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/taskCards.test.ts`
- Test: `tests/officeTaskState.test.ts`
- Test: `tests/managerOfficeSource.test.ts`
- Test: `tests/processingTimeSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage that proves we only show task chrome for actionable work and that non-latest message actions stay hidden unless hover/focus/latest. The new assertions should live in the existing source tests and task state tests:

```ts
// tests/managerOfficeSource.test.ts
expect(managerSource).toContain("activeOfficeTask");
expect(managerSource).toContain("isLatestMessage");
expect(managerSource).toContain("message-action-row");
expect(stylesSource).toContain(".codex-message-frame:hover .message-action-row");
expect(stylesSource).toContain(".codex-message-frame:focus-within .message-action-row");
expect(stylesSource).toContain(".codex-message-frame.latest .message-action-row");
expect(managerSource).toContain("composer-output-files");
expect(managerSource).toContain("task-card");
```

```ts
// tests/taskCards.test.ts
expect(shouldShowTaskCard("你好")).toBe(false);
expect(shouldShowTaskCard("帮我修改 README")).toBe(true);
expect(formatTaskStatus("processing")).toBe("处理中");
```

- [ ] **Step 2: Run the targeted tests and confirm the current UI still fails the new expectations**

Run:

```powershell
npm.cmd test -- tests/taskCards.test.ts tests/officeTaskState.test.ts tests/managerOfficeSource.test.ts tests/processingTimeSource.test.ts
```

Expected: the new assertions fail until the UI chrome is tightened.

- [ ] **Step 3: Implement the minimal task-progress wiring**

Use the existing `src/lib/taskCards.ts` and `src/lib/officeTaskState.ts` instead of adding a new task system. Keep the task card inline, keep the plan short, and keep casual greetings as plain chat.

Representative shape to preserve:

```ts
export type TaskCard = {
  id: string;
  title: string;
  plan: string[];
  phase: TaskPhase;
  startedAt: number;
  finishedAt?: number;
  error?: string;
};
```

Keep `ManagerPage.tsx` rendering logic in this pattern:

```tsx
const isLatestMessage = index === messages.length - 1;
const showActions = isLatestMessage || (message.role === "assistant" && activeOfficeTask?.phase === "processing");
```

Use CSS so older actions stay quiet and the latest active item still feels alive:

```css
.codex-message-frame:hover .message-action-row,
.codex-message-frame:focus-within .message-action-row,
.codex-message-frame.latest .message-action-row {
  opacity: 1;
  pointer-events: auto;
}
```

Do not add a separate task page. Keep output files attached to the relevant assistant response and keep the processing time label in place.

- [ ] **Step 4: Rerun the focused tests**

Run:

```powershell
npm.cmd test -- tests/taskCards.test.ts tests/officeTaskState.test.ts tests/managerOfficeSource.test.ts tests/processingTimeSource.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the task-progress slice**

```powershell
git add src/lib/taskCards.ts src/lib/officeTaskState.ts src/components/ManagerPage.tsx src/styles.css tests/taskCards.test.ts tests/officeTaskState.test.ts tests/managerOfficeSource.test.ts tests/processingTimeSource.test.ts
git commit -m "Polish Codex-style task progress"
```

### Task 2: Compact bridge management and explicit execution target labeling

**Files:**
- Modify: `src/lib/remoteBridge.ts`
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Modify: `electron/main.ts` only if the renderer needs a normalized bridge summary from main
- Test: `tests/remoteBridgeSettings.test.ts`
- Test: `tests/remoteBridgeSource.test.ts`
- Test: `tests/remoteBridgeClient.test.ts`

- [ ] **Step 1: Write the failing bridge tests**

Add assertions that the bridge area still lives inside the current system page, but now reads as a compact summary and exposes the current execution target label clearly:

```ts
// tests/remoteBridgeSource.test.ts
expect(managerSource).toContain("remote-bridge-section");
expect(managerSource).toContain("remote-bridge-status-row");
expect(managerSource).toContain("remote-host-list");
expect(managerSource).toContain("composer-target-picker");
expect(managerSource).toContain("activeRemoteTargetDescription");
```

```ts
// tests/remoteBridgeSettings.test.ts
expect(settings.remoteBridge.activeTargetId).toBe("local");
expect(settings.remoteBridge.relay.status).toBe("disabled");
expect(settings.remoteBridge.knownHosts).toEqual([]);
```

- [ ] **Step 2: Run the targeted bridge tests**

Run:

```powershell
npm.cmd test -- tests/remoteBridgeSettings.test.ts tests/remoteBridgeSource.test.ts tests/remoteBridgeClient.test.ts
```

Expected: the compact summary expectations fail until the UI/state are tightened.

- [ ] **Step 3: Implement the bridge summary and target label**

Keep the bridge UI in one compact system section with three visible ideas only:

1. local bridge state
2. cloud relay state
3. discovered / trusted remote devices

The summary should show:

```ts
type CompactBridgeSummary = {
  localStatus: "disabled" | "listening" | "connected" | "error";
  relayStatus: "disabled" | "listening" | "connected" | "error";
  activeTargetLabel: string;
  activeTargetDescription: string;
};
```

The composer target picker should clearly show local vs remote execution without duplicating the whole bridge panel. Keep the bridge details available, but tucked behind the existing controls instead of spreading into another screen.

If a helper is needed, keep it in `src/lib/remoteBridge.ts` so bridge state normalization stays close to the existing types.

- [ ] **Step 4: Rerun the targeted bridge tests**

Run:

```powershell
npm.cmd test -- tests/remoteBridgeSettings.test.ts tests/remoteBridgeSource.test.ts tests/remoteBridgeClient.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit the bridge slice**

```powershell
git add src/lib/remoteBridge.ts src/components/ManagerPage.tsx src/styles.css electron/main.ts tests/remoteBridgeSettings.test.ts tests/remoteBridgeSource.test.ts tests/remoteBridgeClient.test.ts
git commit -m "Compact bridge management"
```

### Task 3: Full verification and final smoke build

**Files:**
- None new
- Recheck: all touched files from Tasks 1 and 2

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm.cmd test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run a production build**

Run:

```powershell
npm.cmd run build
```

Expected: exit code 0 and a fresh renderer / Electron build.

- [ ] **Step 3: Smoke-check the key UI paths**

Open the app and verify:

- a plain greeting stays plain;
- a real office task shows inline progress;
- message actions only show on hover / latest;
- the bridge area is compact;
- the active execution target label is visible and correct.

- [ ] **Step 4: Stop before packaging unless the user explicitly asks for a package update**

Do not generate a new installer in this pass. This round is for stabilization and UI tightening.
