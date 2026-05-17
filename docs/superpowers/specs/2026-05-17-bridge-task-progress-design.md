# Bridge and Task Progress Design

Date: 2026-05-17

## Goal

Make HaJiMi feel like a single capable office companion, not a pile of separate tools.

This upgrade has two linked parts:

- remote bridge management: one place to manage local bridge, cloud relay, trusted devices, and permissions;
- task progress: Codex-like inline progress, cancellation, retry, and output file handling for office work.

The user experience must stay light. No new heavyweight dashboard. No extra always-on service beyond the already planned relay and bridge processes. The current Codex-like office layout stays the foundation.

## What This Is

This is an incremental redesign of the existing office and system surfaces.

It is not:

- a new full-screen admin console;
- a separate task center that duplicates chat;
- screen mirroring or remote desktop streaming;
- a second agent loop that runs on the host computer for the controller.

The bridge is for execution targets. The task progress layer is for trust and completion feedback.

## User Experience

### Task Progress

When a user sends an office task, the conversation shows a compact task state inline with the chat stream.

The task should look and behave like Codex:

- the latest active task is visible by default;
- older completed messages stay visually quiet;
- action buttons only appear on hover, focus, or the latest active message;
- progress is shown inline, not in a separate floating window.

The task state should expose:

- start;
- current step or short progress line;
- elapsed time;
- completed;
- failed;
- cancelled;
- retry.

The UI should not show a big planning card for trivial messages like a plain greeting. For simple chat, the assistant answer stays simple. For actual work tasks, task progress appears.

Output files appear as compact attachments below the relevant task response, with actions for:

- open file;
- open folder;
- copy path.

### Bridge Management

Bridge controls stay under the existing system / channel management area.

The user should see one compact bridge summary instead of multiple disconnected screens:

- local bridge status;
- cloud relay status;
- discovered devices;
- paired devices;
- current permission mode;
- revoke / disconnect controls;
- relay URL and pairing state.

Bridge status should be immediately understandable:

- local / relay / disconnected;
- current target device name;
- whether the controller is acting on local or remote computer.

The bridge UI should not expose internal transport details unless the user opens details.

## Scope

Included:

- inline office task progress cards;
- elapsed time display for active tasks;
- cancel and retry on the active task;
- output file cards for generated files;
- remote bridge summary panel;
- trusted device list;
- permission mode selection;
- local bridge and cloud relay status in one place;
- explicit execution target label for local vs remote work.

Not included:

- a separate task history page;
- a separate remote bridge dashboard page;
- screen sharing;
- remote keyboard/mouse mirroring;
- multi-controller collaboration;
- background task orchestration beyond the current agent loop.

## UI Rules

The layout must stay Codex-like:

- left sidebar remains the project / conversation rail;
- the main conversation stays central;
- composer remains at the bottom;
- progress and bridge information stay compact;
- no extra large cards unless the task actually needs them.

Message actions:

- hide copy / edit / retry controls until hover or latest active message;
- keep the current message layout clean;
- do not duplicate the same action both inside and outside the message frame.

Bridge controls:

- keep controls small and grouped;
- use status chips and compact rows instead of long help text;
- keep relay setup in the system section;
- keep direct LAN discovery separate from relay details, but in the same bridge panel.

## Architecture

### Task Progress Model

Add a normalized task state that the renderer can display regardless of model provider.

Suggested fields:

- `id`
- `conversationId`
- `source` (`local`, `office`, `channel`, `bridge`)
- `phase` (`starting`, `processing`, `completed`, `failed`, `cancelled`)
- `title`
- `statusLine`
- `elapsedMs`
- `steps`
- `outputFiles`
- `canRetry`
- `canCancel`
- `targetLabel`

The existing office task pipeline should emit progress updates into this shape instead of the renderer guessing state from raw messages.

### Bridge Model

Unify local bridge, cloud relay, and discovered devices under one bridge state structure.

Suggested groups:

- `localBridge`: enabled, listening, paired hosts, permissions
- `relay`: enabled, url, connected, sessionId
- `knownHosts`: discovered or paired targets
- `activeTarget`: currently selected execution target

The renderer should consume a single state object and render only the parts that are relevant for the current screen.

### Separation of Responsibilities

Main process:

- owns bridge connectivity;
- owns task progress emission;
- owns file operations and local execution state;
- normalizes bridge and task updates for the renderer.

Renderer:

- displays the Codex-like task cards;
- shows compact bridge status;
- lets the user select target / permission / retry / cancel;
- never infers hidden system state.

## Data Flow

Task flow:

```text
User submits office message
  -> create task state
  -> attach task to conversation
  -> emit elapsed/time/step updates
  -> append assistant result
  -> attach output files
  -> mark completed/failed/cancelled
```

Bridge flow:

```text
User enables bridge or relay
  -> main process starts or resumes the correct transport
  -> host/device state is refreshed
  -> renderer receives normalized bridge summary
  -> user selects local or remote target
  -> task execution routes to the selected target
```

Remote execution label flow:

```text
Selected target changes
  -> composer label updates
  -> task cards show the current execution label
  -> generated output files inherit the same label
```

## Error Handling

- A bridge failure must not break the office chat.
- A task failure must still preserve the last usable progress state.
- A cancelled task must stop progress emission and show a final cancelled state.
- A missing output file must show a friendly "file no longer exists" action state.
- A device list refresh failure should degrade to the last known state with a small warning, not a blank page.
- Relay failures should fall back to manual local / LAN bridge paths when available.

## Testing

Add focused tests for:

- task progress phase transitions;
- simple chat staying simple while office tasks show progress;
- output file card rendering and actions;
- bridge summary normalization for local, LAN, and relay modes;
- explicit execution target label switching;
- no new cluttered sidebar / duplicate page entry is introduced.

Recommended verification:

```text
npm.cmd test
npm.cmd run build
```

## Rollout

Implement in this order:

1. Normalize task progress state and wire it into the current office conversation UI.
2. Reduce message action clutter to match the Codex hover/latest behavior.
3. Unify bridge management into one compact system panel with local, LAN, and relay status.
4. Add explicit local vs remote execution target labeling to the composer and task cards.

Do not add a new page unless the existing system and office surfaces become impossible to keep compact.
