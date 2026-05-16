# Remote Tool Bridge Design

Date: 2026-05-17

## Purpose

HaJiMi should let one computer's HaJiMi control another computer through an explicit, permissioned bridge.

The important boundary is:

- Computer B owns the model, conversation, planning, and agent loop.
- Computer A exposes local tools and enforces local permissions.
- Computer A does not need an API key, model profile, Claude Agent SDK, or OpenClaw agent configuration to be controlled.

This is a remote tool bridge, not remote session mirroring and not "A runs its own agent for B".

## Roles

### Host Device

The host is the computer being controlled. It runs HaJiMi and exposes a permissioned tool server.

Responsibilities:

- Generate pairing codes.
- Accept or reject remote device requests.
- Store trusted devices and their granted permission level.
- Execute allowed local tools.
- Enforce permission boundaries before every tool call.
- Show active connection and task status.
- Let the local user pause, disconnect, or revoke access immediately.
- Write an audit log for remote actions.

The host never receives or stores the remote user's API key.

### Controller Device

The controller is the computer where the user chats with HaJiMi. It owns the active model and agent runtime.

Responsibilities:

- Connect to a paired host.
- Present hosts as execution environments.
- Inject the selected execution environment into the agent prompt.
- Route tool calls to the selected environment.
- Display remote results, generated files, failures, and permission prompts in the current office conversation.

The controller can use ordinary OpenAI-compatible mode, Claude Agent SDK mode, or the current ordinary office agent path. The bridge is below the model layer.

## First Version Scope

The first version supports local network direct connections only.

Included:

- Host-side "Allow remote control of this computer" switch.
- Pairing code for a controller to join.
- Trusted remote device list.
- Per-device permission level.
- Controller-side execution environment selector.
- Remote tool calls from B to A.
- Host-side status, audit log, pause, disconnect, and revoke controls.
- One controller connected to one host at a time.

Not included:

- Public internet relay.
- Cloud task queue.
- Screen streaming.
- Remote mouse or keyboard streaming.
- Multi-controller collaboration.
- Sharing host API keys.
- Silent privilege escalation.

## Execution Environment Model

Every office conversation has a current execution environment.

Initial environments:

- Local
- Remote device: `<device name>`

When the user selects a remote device, the agent receives explicit context:

```text
Current execution environment: Remote device "<device name>".
All file, app, command, system, desktop, and office-document tool calls target this remote device unless the user explicitly switches environment.
Do not operate on the local computer while this remote environment is selected.
When reporting paths or created files, name the remote device.
```

Every outgoing tool call includes:

```json
{
  "targetDeviceId": "local-or-remote-device-id",
  "tool": "readFile",
  "args": {}
}
```

This prevents the model from guessing whether "desktop", "current project", "open WeChat", or "run this command" means A or B.

Conversation messages should display a small execution label such as:

- Local
- Remote: Laptop-A

The label is informational and should not make the UI heavier than the current Codex-like composer.

## Permission Model

The host grants permissions to each paired controller. The controller cannot grant itself permissions.

### Default Permission

Default permission is for new or low-trust devices.

Allowed:

- List files in the allowed workspace.
- Read files in the allowed workspace.
- Inspect documents.
- Read system status.
- Read process summaries.

Blocked:

- Write, delete, rename, or overwrite files.
- Execute commands.
- Open applications.
- Install software.
- Change startup items.
- Operate outside the allowed workspace.

### Auto Review Permission

Auto review is for trusted personal devices where the host still wants protection for risky operations.

Allowed without host confirmation:

- Read files.
- Write new files inside the allowed workspace.
- Modify low-risk project files.
- Create or split Office files.
- Inspect system status and process lists.

Requires host confirmation:

- Delete files.
- Overwrite files outside the task's explicit target.
- Execute shell commands.
- Open applications.
- Modify startup items.
- Install or update software.
- Operate outside the selected workspace.

### Full Access Permission

Full access matches the spirit of Codex's full access permission.

Allowed:

- Full workspace file operations.
- Command execution.
- Application launching.
- Office file processing.
- System maintenance tools exposed by HaJiMi.
- Existing ordinary office and Claude Agent SDK tool capabilities routed to the host.

The host still keeps:

- Emergency stop.
- Disconnect.
- Revoke permission.
- Audit log.
- Visible "remote device is controlling this computer" status.

Full access is real working access, not a read-only mode with a stronger label.

## Host Tool Surface

The first version exposes a focused set of tools already aligned with HaJiMi's office features:

- `listFiles`
- `readFile`
- `writeFile`
- `inspectDocument`
- `createSpreadsheet`
- `splitSpreadsheet`
- `systemStatus`
- `processList`
- `openApplication`
- `runCommand`

The host validates every request before execution:

- Is the remote device still trusted?
- Is the bridge enabled?
- Is the requested permission allowed?
- Is the path inside the allowed root when required?
- Does the operation require host confirmation?
- Is there an active cancellation request?

Tool results are serialized back to the controller as text, structured output metadata, or output-file references.

## Connection Flow

1. Host opens System or Channels and enables remote control.
2. Host generates a short pairing code and local connection address.
3. Controller opens execution environment settings and chooses "Add remote computer".
4. Controller enters the pairing code.
5. Host shows the incoming device name and asks for permission level.
6. Host approves.
7. Controller stores the remote device as an execution environment.
8. User selects the remote device in the composer.
9. Controller's agent plans normally and sends tool calls to the host.
10. Host executes allowed tools and streams status/results back.

Pairing codes expire after a short window. Existing trusted devices reconnect without a new code until revoked.

## UI Design

### Host UI

Add a "Remote Bridge" section under System or Channels.

Host view shows:

- Bridge enabled/disabled.
- Pairing code and copy button when pairing is active.
- Connected controller device.
- Granted permission.
- Current task.
- Recent remote actions.
- Pause button.
- Disconnect button.
- Revoke device button.

When a high-risk request needs review, the host prompt must show:

- Requesting device.
- Target device.
- Requested operation.
- Permission level.
- Allow once.
- Deny.
- Disconnect.

### Controller UI

Add execution environment selection near the model selector in the composer.

It should be compact:

- `Local`
- `Remote: Laptop-A`

For the first version, keep this as a small picker, not a new full page. Remote device management can live in System or Channels.

## Data Model

Add remote bridge settings to app settings:

- `remoteBridge.enabled`
- `remoteBridge.deviceName`
- `remoteBridge.pairing`
- `remoteBridge.trustedDevices`
- `remoteBridge.knownHosts`
- `remoteBridge.defaultTargetDeviceId`

Trusted device record:

- `id`
- `name`
- `publicKey`
- `permissionMode`
- `allowedWorkspace`
- `pairedAt`
- `lastSeenAt`
- `revokedAt`

Known host record:

- `id`
- `name`
- `address`
- `publicKey`
- `lastConnectedAt`

Sensitive shared secrets should not be stored in plain text when safe storage is available.

## Transport

Use a local WebSocket transport for the first version.

Message types:

- `pairing.request`
- `pairing.approve`
- `pairing.reject`
- `tool.call`
- `tool.result`
- `tool.error`
- `task.cancel`
- `status.update`
- `permission.reviewRequired`
- `permission.reviewDecision`
- `heartbeat`

The host should bind to local network interfaces only when bridge is enabled. When disabled, no listener should remain active.

The controller should tolerate disconnects and show a retryable error in the conversation.

## Security Rules

- Host permissions are authoritative.
- Controller-side UI is advisory and never sufficient for authorization.
- Every tool call is checked on the host.
- The host user can stop the bridge at any time.
- Pairing uses a short-lived code and device identity.
- Known devices can be revoked.
- Tool calls include target device id and request id.
- Audit logs are append-only user-visible records.
- Full access still means visible remote-control status and emergency stop.

## Error Handling

Common errors:

- Host offline.
- Pairing expired.
- Permission denied.
- Confirmation timed out.
- Tool failed.
- File outside allowed workspace.
- Remote task cancelled.

Controller behavior:

- Show the error in the current conversation.
- Offer retry when the connection is recoverable.
- Keep the user's original prompt and attachments.

Host behavior:

- Log denied and failed operations.
- Keep bridge running unless the error is fatal or the user disconnects.

## Testing Plan

Unit tests:

- Permission decisions for each mode.
- Path boundary checks.
- Tool request serialization.
- Pairing expiry.
- Trusted device revoke behavior.
- Target environment prompt injection.

Integration tests:

- Controller connects to host with pairing code.
- Controller calls a read-only tool on host.
- Default permission blocks write and command execution.
- Auto review emits review-required event for risky operations.
- Full access allows command execution through the host tool layer.
- Host cancellation stops an in-flight remote task.

Source-level regression tests:

- A host does not import or require model clients for bridge execution.
- Controller always includes `targetDeviceId` in remote tool calls.
- UI keeps execution environment separate from model selection.

Manual verification:

- Two HaJiMi instances on one machine using different profiles and ports.
- Two machines on the same LAN.
- Disconnect and reconnect trusted device.
- Revoke device and confirm it cannot reconnect.

## Implementation Order

1. Add shared remote bridge types and permission policy.
2. Add host-side tool executor wrapper around existing local office tools.
3. Add WebSocket host listener with pairing and trusted device state.
4. Add controller-side remote host client.
5. Add execution environment picker to the composer.
6. Route agent tool calls through selected target environment.
7. Add host status, audit, pause, disconnect, and revoke UI.
8. Add tests and manual two-instance verification.

## Success Criteria

- A host computer with no configured model can still be controlled by a paired controller.
- The controller's model can perform real work on the host through remote tools.
- The selected execution environment is visible and unambiguous.
- Default permission cannot mutate host state.
- Full access can perform the same class of work as local full-access HaJiMi/Codex-style operation.
- The host can stop or revoke remote access immediately.
- Remote bridge code does not make normal app startup noticeably heavier when disabled.
