# Skills Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude-style Skills management to HaJiMi with `/` invocation, native Claude Agent SDK skill routing, and OpenClaw-compatible skill context.

**Architecture:** Add a focused skill registry/store layer in Electron main, expose it through IPC, and keep UI integration compact in the existing office-first manager. Skill resolution is shared: the composer, Claude Agent SDK, OpenClaw, and fallback agent all consume the same resolved skill payload.

**Tech Stack:** Electron main IPC, React, TypeScript, Vitest, Claude Agent SDK `skills` option, OpenClaw config prompt adaptation.

---

### Task 1: Skill Types And Parser

**Files:**
- Create: `src/lib/skills.ts`
- Test: `tests/skills.test.ts`

- [ ] **Step 1: Write parser tests**

Create tests that prove `parseSkillMarkdown()` reads YAML-like frontmatter, derives a folder-name fallback, and flags risky text.

```ts
import { parseSkillMarkdown, normalizeSkillName, resolveSkillInvocation } from "../src/lib/skills";

describe("skills", () => {
  it("parses SKILL.md frontmatter and body", () => {
    const parsed = parseSkillMarkdown("---\nname: excel-summary\ndescription: Analyze spreadsheets\n---\n# Guide\nUse tables.", "Excel Summary");
    expect(parsed.name).toBe("excel-summary");
    expect(parsed.description).toBe("Analyze spreadsheets");
    expect(parsed.body).toContain("Use tables.");
    expect(parsed.warnings).toEqual([]);
  });

  it("falls back to folder name and warns about risky shell text", () => {
    const parsed = parseSkillMarkdown("# Skill\nRun powershell rm -rf when needed.", "PDF Helper");
    expect(parsed.name).toBe("pdf-helper");
    expect(parsed.warnings.join("\n")).toMatch(/危险|shell|命令/);
  });

  it("resolves slash invocations", () => {
    expect(resolveSkillInvocation("/excel-summary 拆表", ["excel-summary"])).toEqual({
      skillName: "excel-summary",
      prompt: "拆表"
    });
  });
});
```

- [ ] **Step 2: Run parser tests and see them fail**

Run: `npm.cmd test -- tests/skills.test.ts`

Expected: FAIL because `src/lib/skills.ts` does not exist.

- [ ] **Step 3: Implement parser helpers**

Add `ManagedSkill`, `SkillImportPreview`, `ResolvedSkillContext`, `parseSkillMarkdown`, `normalizeSkillName`, `resolveSkillInvocation`, and `buildSkillContextText`.

- [ ] **Step 4: Run parser tests**

Run: `npm.cmd test -- tests/skills.test.ts`

Expected: PASS.

### Task 2: Skill Store And IPC

**Files:**
- Create: `electron/skillStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `tests/skillStore.test.ts`
- Test: `tests/skillsIpcSource.test.ts`

- [ ] **Step 1: Write store tests**

Test importing a temporary folder with `SKILL.md`, rejecting a folder without `SKILL.md`, updating enabled state, and removing imported skills.

- [ ] **Step 2: Implement `SkillStore`**

Use `%APPDATA%/xiaomi-pet-windows/skills/registry.json` plus `skills/managed/<id>/`.

The public methods are:

```ts
listSkills(): Promise<ManagedSkill[]>
importSkillFolder(sourceDir: string): Promise<ManagedSkill>
updateSkill(id: string, patch: Partial<Pick<ManagedSkill, "enabled" | "scope" | "projectPath">>): Promise<ManagedSkill>
removeSkill(id: string): Promise<void>
readSkillBody(skill: ManagedSkill): Promise<string>
```

- [ ] **Step 3: Add IPC**

Expose:

```ts
listSkills(): Promise<ManagedSkill[]>
importSkillFolder(): Promise<ManagedSkill | undefined>
updateSkill(id: string, patch: SkillUpdatePatch): Promise<ManagedSkill>
removeSkill(id: string): Promise<void>
```

Use Electron `dialog.showOpenDialog` for import.

- [ ] **Step 4: Run IPC/store tests**

Run: `npm.cmd test -- tests/skillStore.test.ts tests/skillsIpcSource.test.ts`

Expected: PASS.

### Task 3: Skill Resolution For Office Tasks

**Files:**
- Create: `electron/skillContext.ts`
- Modify: `electron/main.ts`
- Test: `tests/skillContext.test.ts`

- [ ] **Step 1: Write resolver tests**

Verify global/project filtering, disabled skills exclusion, explicit `/skill` pinning, and auto mode compact index.

- [ ] **Step 2: Implement resolver**

Create:

```ts
resolveOfficeSkillContext(options: {
  skills: ManagedSkill[];
  task: string;
  projectPath: string;
  mode: "auto" | "off" | "pinned";
  pinnedSkillIds: string[];
  readBody(skill: ManagedSkill): Promise<string>;
}): Promise<ResolvedSkillContext>
```

- [ ] **Step 3: Wire resolver into main task routing**

Before running ordinary or advanced office, compute the skill context once and pass it to the backend runner.

- [ ] **Step 4: Run resolver tests**

Run: `npm.cmd test -- tests/skillContext.test.ts`

Expected: PASS.

### Task 4: Claude And OpenClaw Backend Integration

**Files:**
- Modify: `electron/claudeAgentClient.ts`
- Modify: `electron/openClawAgentClient.ts`
- Modify: `electron/agentClient.ts`
- Test: `tests/claudeAgentClient.test.ts`
- Test: `tests/openClawAgentClient.test.ts`
- Test: `tests/agentClient.test.ts`

- [ ] **Step 1: Extend backend option types**

Add optional skill context to Claude, OpenClaw, and fallback agent task options.

- [ ] **Step 2: Wire Claude native skills**

Pass `skills: "all"` for auto when resolved skills exist, or `skills: resolvedSkillNames` for pinned tasks. Do not add `"Skill"` to `allowedTools`.

- [ ] **Step 3: Wire OpenClaw compatibility text**

Append compact skill index and selected skill bodies to OpenClaw `systemPromptOverride`. Disabled skills must not appear.

- [ ] **Step 4: Wire fallback compatibility text**

Append deterministic skill context to fallback agent system prompt, without changing permissions.

- [ ] **Step 5: Run backend tests**

Run: `npm.cmd test -- tests/claudeAgentClient.test.ts tests/openClawAgentClient.test.ts tests/agentClient.test.ts`

Expected: PASS.

### Task 5: Skills UI Page

**Files:**
- Modify: `src/components/ManagerSidebar.tsx`
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/skillsManagerSource.test.ts`

- [ ] **Step 1: Add source test**

Check that sidebar includes `"skills"`, manager calls `listSkills`, and Skills page renders import/remove/enable controls.

- [ ] **Step 2: Add section**

Add `skills` to `ManagerSection`, add a sidebar nav item, and render a two-column Skills page.

- [ ] **Step 3: Add state and IPC calls**

Load skills on mount and after import/update/remove.

- [ ] **Step 4: Style lightly**

Reuse model manager visual patterns with compact rows and a detail panel.

- [ ] **Step 5: Run UI source test**

Run: `npm.cmd test -- tests/skillsManagerSource.test.ts`

Expected: PASS.

### Task 6: Slash Palette And Composer Skill Mode

**Files:**
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/skillsSlashSource.test.ts`

- [ ] **Step 1: Add source test**

Check that typing `/` opens a `composer-skill-menu`, filters skills, and selecting one inserts `/skill-name ` into the office draft.

- [ ] **Step 2: Add local composer state**

Add:

```ts
const [skillMode, setSkillMode] = useState<"auto" | "off" | "pinned">("auto");
const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
const [skillMenuOpen, setSkillMenuOpen] = useState(false);
```

- [ ] **Step 3: Implement slash filtering**

When the draft starts with `/`, show enabled skills whose name or description contains the typed query.

- [ ] **Step 4: Include skill options in task call**

Send skill mode and pinned ids through `onSendOfficeMessage` to main IPC.

- [ ] **Step 5: Run slash tests**

Run: `npm.cmd test -- tests/skillsSlashSource.test.ts`

Expected: PASS.

### Task 7: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
npm.cmd test -- tests/skills.test.ts tests/skillStore.test.ts tests/skillContext.test.ts tests/skillsIpcSource.test.ts tests/skillsManagerSource.test.ts tests/skillsSlashSource.test.ts tests/claudeAgentClient.test.ts tests/openClawAgentClient.test.ts tests/agentClient.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run: `npm.cmd test`

Expected: PASS.

- [ ] **Step 4: Local smoke**

Start dev app, confirm manager and pet windows load, then stop dev processes.

Expected: no blank screen; runtime log contains manager and pet `did-finish-load`.
