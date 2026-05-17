# Office Output, Stability, and Pet Sync Design

Date: 2026-05-17

## Goal

Polish the office experience around three areas that are already partially built:

- task output artifacts;
- ordinary office stability details;
- pet state synced to office work.

This is an experience pass, not a new agent architecture. The OpenClaw / Claude Code routing is already settled and should not be exposed as extra modes in the office UI.

## Current State

HaJiMi already has:

- office conversations with project scope, model selection, permission selection, and local / remote execution target selection;
- file attachments for user input;
- generated file outputs returned by the agent layer;
- IPC actions to open output files and show them in the file manager;
- task cards with elapsed processing time, cancellation, retry, and quieter older actions;
- ordinary office routing that uses OpenClaw first and falls back to the HaJiMi compat agent when OpenClaw is unavailable;
- advanced office routing through Claude Agent SDK / Claude Code;
- capability checks and repair actions for model, workspace, OpenClaw, WeChat, and remote bridge;
- pet animations, bubbles, hover actions, and task-adjacent moods.

The next upgrade should organize and polish these existing capabilities instead of adding another page or another visible work mode.

## Non-Goals

This design does not add:

- HermesClaw;
- another visible "agent framework" picker;
- a new task center separate from the office conversation;
- always-visible route labels such as "Using OpenClaw" on every message;
- a heavy background scheduler for pet behavior;
- a new remote bridge architecture.

## Design Principles

The office surface should feel like Codex:

- one main conversation;
- quiet metadata;
- actions appear on hover, focus, or the latest active item;
- trivial chat stays trivial;
- real work gets progress and output affordances;
- errors explain what happened and what to do next.

Technology routes are internal. The user sees model, permission, target, progress, outputs, and repair options. They do not need to see OpenClaw / compat agent details unless something abnormal happens.

## 1. Task Output Artifacts

### Current Basis

The backend already returns `fileOutput` and `fileOutputs` from the compat agent, and the UI already has open / show output file IPC handlers. OpenClaw and Claude Code responses can also mention generated files in text, but the product experience is still mostly chat-text based.

### Upgrade

Add a compact output artifact block beneath the relevant assistant/task response when a task creates or identifies files.

Each artifact row should show:

- file name;
- type or extension;
- size when known;
- saved location in quiet text;
- open file action;
- show in folder action;
- copy path action.

Multiple outputs should be grouped under one quiet header such as "本次生成 2 个文件".

If a task fails after creating partial outputs, those outputs should still be shown with a small note that the task did not fully complete.

### UX Rules

- Do not dump full binary or spreadsheet contents into chat.
- Do not show artifact blocks for plain text answers.
- Keep older artifact actions hidden until hover or focus, matching existing message action behavior.
- Generated files remain part of the conversation history, not a separate downloads page.

### Acceptance Criteria

- A task that creates one file displays one artifact row with actions.
- A task that creates multiple files displays one grouped artifact block.
- Clicking open/show works with existing IPC.
- Copy path works without changing the message layout.
- Existing text-only chat does not gain extra cards.

## 2. Ordinary Office Stability Details

### Current Basis

Ordinary office already prefers OpenClaw. The HaJiMi compat agent exists as fallback. Capability checks can detect and repair parts of the chain.

### Upgrade

Make failures and fallback behavior clearer without making normal messages noisier.

Normal successful tasks should not say "Using OpenClaw" or "Using Claude Code" every time. The model picker already implies the route:

- OpenAI-compatible model: ordinary office, OpenClaw first;
- Claude Agent SDK model: advanced office, Claude Code path.

Only show route-related notices when something changes or fails:

- OpenClaw is unavailable and compat fallback is used;
- Claude Code is missing or cannot start;
- a model rejects tool / agent requests;
- permission mode blocks the requested action;
- remote bridge disconnects or denies a tool;
- a task times out or is cancelled.

### Error Shape

Errors should be normalized into three short parts:

- what happened;
- what HaJiMi already tried;
- what the user can do next.

Examples:

- "OpenClaw 模板缺失。已尝试自动补齐。请重新发送，或到系统页运行能力体检。"
- "当前权限不允许执行命令。可以切到自动审查或完全访问权限后重试。"
- "远程电脑已断开。可以重新连接桥接，或切回本机执行。"

### Fallback Notice Rules

Fallback is an internal safety net. It should be visible only as a light, one-time task note:

- "OpenClaw 暂不可用，已切换到兼容兜底处理。"

Do not present compat agent as a selectable product mode.

### Acceptance Criteria

- Successful ordinary tasks do not show route labels.
- Fallback shows one compact notice only when it happens.
- OpenClaw / Claude Code / remote errors are classified into user-readable messages.
- Capability repair remains in the system page and is linked from relevant failures when useful.

## 3. Pet State Sync

### Current Basis

The pet already has animation states and bubbles, including working, waiting, happy, failed, review, jumping, waving, and idle-like behavior. The office task state already knows when work starts, finishes, fails, or is cancelled.

### Upgrade

Bind pet feedback to office task state in a light way.

Suggested mapping:

- task starts: review or working mood;
- task is processing: waiting mood with subtle idle animation;
- task runs for a long time: occasional bubble such as "我还在处理";
- task succeeds: happy / waving mood and a short completion bubble;
- task fails: failed /委屈 mood and a short failure bubble;
- task is cancelled: calm / idle mood.

Task type can slightly affect copy:

- file output: "文件整理好了";
- remote target: "我去那台电脑处理完了";
- WeChat task: "微信里的任务处理完了";
- long-running task: "还在处理中，先别急";
- partial failure: "有一部分完成了，我把结果放出来了".

### UX Rules

- Pet feedback must not steal focus from the office conversation.
- Reminder bubbles and chat bubbles should not overlap.
- No constant looping actions just because a task is active.
- Long-task bubbles should be rate-limited.
- Imported pets should use the same state mapping, falling back to safe animation rows when a specific row is unavailable.

### Acceptance Criteria

- Starting, completing, failing, and cancelling an office task each triggers at most one lightweight pet feedback event.
- Long-running tasks trigger occasional feedback without repeating constantly.
- The pet returns to a normal idle state after task completion or cancellation.
- Imported pets do not flicker or get stuck in one animation.

## Implementation Boundaries

Keep the work scoped to existing surfaces:

- office conversation renderer;
- task state / task cards;
- file output metadata;
- capability / error normalization;
- pet command dispatch from task events.

Avoid introducing a new global store unless existing state becomes clearly impossible to coordinate. Prefer small helpers that normalize output artifacts, errors, and pet task events.

## Testing

Add or update tests for:

- artifact grouping and action wiring;
- no artifact block for plain chat;
- fallback notice only on actual fallback;
- error classification;
- pet task event mapping;
- imported pet fallback animation behavior if touched.

Run at least:

- focused unit tests for task cards, office source, and agent clients;
- `npm.cmd run build`;
- a local Electron smoke check for no blank screen.

## Open Questions

No product-blocking questions remain.

The only implementation choice is whether artifact extraction should start from explicit `fileOutputs` only, or also parse file paths from OpenClaw / Claude text responses. The safer first pass is explicit outputs plus conservative path detection for known workspace/Desktop outputs.
