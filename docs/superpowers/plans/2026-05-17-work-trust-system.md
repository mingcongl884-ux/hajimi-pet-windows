# Work Trust System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task confidence cards, capability checks, and lightweight project memory without making HaJiMi heavier or adding new main pages.

**Architecture:** Keep the office page as the single user-facing flow. Add focused helper modules for task cards, capability result formatting, and project memory, plus small Electron IPC handlers for system checks and file actions. Persist project memory in a separate JSON file under app user data so settings remain configuration-only.

**Tech Stack:** Electron IPC, React/TypeScript, Vite, Vitest, Node filesystem/process helpers.

---

### Task 1: Task Card State And File Card Helpers

**Files:**
- Create: `src/lib/taskCards.ts`
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/taskCards.test.ts`
- Test: `tests/managerOfficeSource.test.ts`

- [ ] **Step 1: Write task card tests**

Create tests covering deterministic plan generation, status labels, elapsed labels, and file action labels.

```ts
import { describe, expect, it } from "vitest";
import { buildTaskPlan, formatTaskStatus, formatTaskElapsed } from "../src/lib/taskCards";

describe("task cards", () => {
  it("builds a compact plan from a file task", () => {
    expect(buildTaskPlan("拆分 template_update.xlsx 并保存到桌面")).toEqual([
      "读取相关文件和当前项目",
      "处理表格数据",
      "保存输出文件",
      "回报结果和路径"
    ]);
  });

  it("formats status and elapsed labels", () => {
    expect(formatTaskStatus("processing")).toBe("处理中");
    expect(formatTaskElapsed(65_000)).toBe("1m 5s");
  });
});
```

- [ ] **Step 2: Implement `src/lib/taskCards.ts`**

Add exported types and helpers:

```ts
export type TaskPhase = "starting" | "processing" | "completed" | "failed" | "cancelled";
export type TaskCard = { id: string; title: string; plan: string[]; phase: TaskPhase; startedAt: number; finishedAt?: number; error?: string };
export function buildTaskPlan(input: string): string[] { /* deterministic 2-4 step plan */ }
export function formatTaskStatus(phase: TaskPhase): string { /* Chinese status label */ }
export function formatTaskElapsed(ms: number): string { /* 1s / 1m 5s */ }
```

- [ ] **Step 3: Wire task cards into `ManagerPage.tsx`**

Replace the current single processing message with an inline task card that shows plan, current status, elapsed time, cancel, and retry. Keep the composer in the current position.

- [ ] **Step 4: Polish output file cards**

Keep compact file cards under assistant messages and reserve action buttons for Task 2 Electron file actions.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- tests/taskCards.test.ts tests/managerOfficeSource.test.ts tests/processingTimeSource.test.ts`

Expected: all selected tests pass.

---

### Task 2: Output File Actions

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/components/ManagerPage.tsx`
- Test: `tests/fileOutputActionsSource.test.ts`

- [ ] **Step 1: Write source wiring test**

Assert IPC names and UI button labels exist.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("file output actions", () => {
  it("wires open, reveal, and copy file actions", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const global = readFileSync("src/global.d.ts", "utf8");
    const manager = readFileSync("src/components/ManagerPage.tsx", "utf8");
    expect(main).toContain("pet:open-output-file");
    expect(main).toContain("pet:show-output-file");
    expect(preload).toContain("openOutputFile");
    expect(global).toContain("openOutputFile(path: string): Promise<void>");
    expect(manager).toContain("打开文件");
    expect(manager).toContain("打开所在文件夹");
  });
});
```

- [ ] **Step 2: Add Electron IPC**

Use `shell.openPath(path)` and `shell.showItemInFolder(path)`. Validate the path is a non-empty string; return friendly errors from the renderer if opening fails.

- [ ] **Step 3: Expose preload/global methods**

Expose `openOutputFile(path)`, `showOutputFile(path)`, and reuse the existing clipboard helper for copy path.

- [ ] **Step 4: Add output card buttons**

Render three icon/text-light buttons: open file, open folder, copy path. Keep them small so message cards do not become bulky.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- tests/fileOutputActionsSource.test.ts tests/managerOfficeSource.test.ts`

Expected: all selected tests pass.

---

### Task 3: Capability Check IPC And UI

**Files:**
- Create: `src/lib/capabilityCheck.ts`
- Create: `electron/capabilityCheck.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/capabilityCheck.test.ts`
- Test: `tests/capabilityCheckSource.test.ts`

- [ ] **Step 1: Write formatter tests**

Test summary generation for ready, warning, and blocked rows.

```ts
import { describe, expect, it } from "vitest";
import { summarizeCapabilities } from "../src/lib/capabilityCheck";

describe("capability check", () => {
  it("summarizes mixed capability rows", () => {
    expect(summarizeCapabilities([
      { id: "model", label: "模型", status: "ready", message: "连接正常" },
      { id: "wechat", label: "微信", status: "warning", message: "未连接" }
    ])).toBe("可用：模型。需配置：微信。");
  });
});
```

- [ ] **Step 2: Implement renderer formatter**

Create `CapabilityRow`, `CapabilityStatus`, `CapabilityCheckResult`, and `summarizeCapabilities()`.

- [ ] **Step 3: Implement Electron checks**

Create `electron/capabilityCheck.ts` with small independent checks:

- active model configured;
- workspace exists and can write a temp probe file;
- ordinary office runtime path available or legacy fallback available;
- Claude Code command or bundled SDK executable detectable;
- OpenClaw CLI/runtime detectable;
- WeChat channel enabled/connected.

- [ ] **Step 4: Wire IPC**

Add `pet:check-capabilities` and expose `checkCapabilities()` to the renderer.

- [ ] **Step 5: Add UI entry points**

Add a compact `检查能力` button to office empty state and a full card in System page. Show summary plus rows, not raw stack traces.

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- tests/capabilityCheck.test.ts tests/capabilityCheckSource.test.ts`

Expected: all selected tests pass.

---

### Task 4: Project Memory Store And Suggestions

**Files:**
- Create: `src/lib/projectMemory.ts`
- Create: `electron/projectMemoryStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ManagerPage.tsx`
- Test: `tests/projectMemory.test.ts`
- Test: `tests/projectMemorySource.test.ts`

- [ ] **Step 1: Write project memory tests**

Test trimming, recent task summaries, output file capture, and suggestion text.

```ts
import { describe, expect, it } from "vitest";
import { updateProjectMemory, buildProjectMemorySuggestion } from "../src/lib/projectMemory";

describe("project memory", () => {
  it("stores recent task and output files without raw content", () => {
    const memory = updateProjectMemory(undefined, {
      projectId: "p1",
      task: "拆分表格",
      files: [{ path: "Desktop/a.xlsx", name: "a.xlsx", size: 10 }],
      at: "2026-05-17T00:00:00.000Z"
    });
    expect(memory.recentTasks[0].title).toBe("拆分表格");
    expect(memory.recentFiles[0].name).toBe("a.xlsx");
    expect(buildProjectMemorySuggestion(memory)).toContain("拆分表格");
  });
});
```

- [ ] **Step 2: Implement renderer memory helpers**

Create memory types, `updateProjectMemory()`, `trimProjectMemory()`, and `buildProjectMemorySuggestion()`.

- [ ] **Step 3: Implement JSON store**

Store `project-memory.json` under user data with atomic-ish write using a temp file then rename. Failures should not block task completion.

- [ ] **Step 4: Wire IPC**

Add `pet:get-project-memory` and `pet:update-project-memory`.

- [ ] **Step 5: Update memory after tasks**

After an office response succeeds, save the user task, attached file names, and response file outputs for the active project.

- [ ] **Step 6: Show one suggestion**

When the office conversation is empty and memory exists, show one subtle suggestion chip above the generic starter chips.

- [ ] **Step 7: Run focused tests**

Run: `npm.cmd test -- tests/projectMemory.test.ts tests/projectMemorySource.test.ts tests/managerOfficeSource.test.ts`

Expected: all selected tests pass.

---

### Task 5: Full Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Diff check**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Do not package**

Stop before installer packaging unless the user explicitly asks for it.
