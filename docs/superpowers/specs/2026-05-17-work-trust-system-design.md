# HaJiMi Work Trust System Design

## Goal

HaJiMi should feel like a reliable office companion, not a text box that sometimes does work. The next upgrade adds three light experience layers:

- task confidence: clear plan, progress, completion, failure, retry, and output file handling;
- capability check: one place to see what the current setup can actually do;
- project memory: small per-project context that helps users continue work without adding a heavy knowledge system.

The priority is experience and trust. The implementation must stay light, reuse the current office page, and avoid new large background services.

## Non-Goals

- No large dashboard or automation center.
- No plugin marketplace.
- No long-term personality database.
- No autonomous background file processing without an explicit user task.
- No extra always-on timers beyond the existing pet/runtime schedule.

## User Experience

### Task Confidence

When a user sends an office task, the conversation shows a compact task card inline with the message flow.

The card has four phases:

1. Starting: show a short generated or deterministic plan, usually 2-5 steps.
2. Processing: show current step and elapsed time.
3. Completed: show final duration, concise result, and output files.
4. Failed or cancelled: show the reason and the next recovery action.

The composer keeps its current position and visual weight. Progress appears in the message stream, not as a modal or separate page.

Example:

```text
Plan
1. Read template_update.xlsx
2. Split rows into two files
3. Save files to Desktop
4. Report output paths

Running: saving files to Desktop... 42s
```

Output files appear as compact cards with:

- file name;
- size when known;
- open file;
- open folder;
- copy path.

If the task fails, the card offers:

- retry the same task;
- retry with the advanced model when available;
- continue manually by editing the prompt.

Partial-step resume is out of scope for the first version. The UI must not claim it can resume from an exact internal checkpoint unless the agent backend exposes a safe checkpoint.

### Capability Check

The app adds a light capability check entry in two places:

- System page: full check with detailed rows.
- Office empty state or composer overflow: quick check, because users discover issues while trying to work.

Checks:

- active model connection;
- ordinary office tool path;
- Claude Code executable and SDK readiness;
- OpenClaw runtime readiness;
- WeChat channel status;
- selected project read/write access.

The result is a concise summary:

```text
Ready: model, project files, ordinary office tools.
Needs setup: WeChat channel.
Optional: Claude Code advanced mode.
```

Each row should explain the fix in one sentence. It should never dump raw stack traces unless the user opens details.

### Project Memory

Each project stores a small memory object:

```ts
type ProjectMemory = {
  projectId: string;
  recentTasks: ProjectMemoryTask[];
  recentFiles: ProjectMemoryFile[];
  preferences: {
    outputFolder?: string;
    spreadsheetFormat?: "xlsx" | "csv";
    language?: string;
  };
  updatedAt: string;
};
```

The memory is updated only from explicit user tasks and generated file outputs. It records:

- recent task title and timestamp;
- files the user attached or the agent generated;
- lightweight output preferences inferred from repeated choices.

It does not store raw file contents or long chat transcripts.

When a project is opened and there is useful memory, the office empty state can show one subtle suggestion:

```text
Last time you split template_update.xlsx. Continue from that?
```

## Architecture

Add three small modules instead of expanding `ManagerPage.tsx` further:

- `src/lib/taskCards.ts`: task card state, phase helpers, display labels.
- `src/lib/capabilityCheck.ts`: renderer-side result types and display formatting.
- `src/lib/projectMemory.ts`: memory update and suggestion helpers.

Electron owns checks that need local system access:

- model test via existing `pet:test-model`;
- Claude Code executable detection via existing Claude Agent client helpers where possible;
- OpenClaw readiness via existing OpenClaw client/channel adapter utilities;
- project file access via safe filesystem checks in the main process.

The renderer only requests and displays results.

## Data Flow

Task flow:

```text
Composer submit
  -> create task card with plan
  -> send office message
  -> update elapsed/current step where available
  -> append assistant result
  -> attach output file cards
  -> update project memory
```

Capability flow:

```text
User clicks capability check
  -> renderer IPC request
  -> main process runs small checks
  -> returns normalized rows
  -> renderer shows summary and details
```

Memory flow:

```text
User task / attachments / output files
  -> update memory for active project
  -> save in settings store or a small separate memory file
  -> show one contextual suggestion next time
```

Store project memory in a separate small JSON file under app user data. This keeps settings focused on configuration and prevents frequent memory updates from increasing settings churn.

## Error Handling

- A failed capability row should not fail the whole check.
- File open actions should show a friendly error when the file no longer exists.
- Project memory write failures should not block the office task result.
- Task cards should handle cancellation and provider errors without leaving the UI stuck in processing.

## Testing

Add focused tests for:

- task phase transitions and retry labels;
- capability check normalization when some checks fail;
- project memory trimming and suggestions;
- file output card source expectations;
- no new chat-only entry points are reintroduced.

Run:

```text
npm.cmd test
npm.cmd run build
```

## Rollout

Implement in three slices:

1. Task card and output file card polish.
2. Capability check IPC and UI.
3. Project memory and one suggestion in the office empty state.

Do not package until the user explicitly asks for a package update.
