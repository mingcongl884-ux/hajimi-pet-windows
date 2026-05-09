# HaJiMi Channel Integrations Design

## Goal

HaJiMi should be controllable from the desktop chat, Feishu, and WeChat while keeping the desktop pet experience simple and safe. The user should be able to send a message from Feishu or WeChat, route it into the same conversation and office-agent system used by the desktop app, and receive replies back in the original channel.

This design follows OpenClaw's channel architecture: channel-specific code handles login and platform events, then forwards normalized messages into an agent routing layer. Feishu and WeChat are both first-phase channels.

## References

- OpenClaw Feishu: `https://docs.openclaw.ai/channels/feishu`
- OpenClaw WeChat: `https://docs.openclaw.ai/channels/wechat`
- OpenClaw repository: `https://github.com/openclaw/openclaw`
- WeClaw bridge patterns: `https://github.com/fastclaw-ai/weclaw`

## First-Phase Channels

### Feishu

Feishu uses an official Feishu/Lark self-built app:

- User configures App ID and App Secret in HaJiMi.
- The app uses Feishu long-connection/WebSocket event subscription for inbound messages.
- Required event: `im.message.receive_v1`.
- Optional later event: Drive comments.
- Direct messages and group mentions are supported.
- Sender allowlist and pairing are required before a remote sender can trigger office-agent actions.

### WeChat

WeChat is included in the first phase through the official plugin model now documented by OpenClaw:

- Prefer `@tencent-weixin/openclaw-weixin` or a compatible local sidecar bridge.
- Login is handled by the plugin/sidecar, usually with QR login.
- HaJiMi does not embed WeChat protocol internals in the main Electron process.
- The bridge normalizes inbound messages and sends outbound replies through its own supported send path.
- Access control still applies before any remote sender can run office-agent actions.

## Architecture

The implementation adds a channel layer beside the current chat and office agent:

```text
Feishu / WeChat
  -> Channel adapter
  -> Channel gateway
  -> Message normalizer
  -> Pairing and allowlist
  -> Conversation router
  -> Chat mode / Office mode / Advanced Agent SDK mode
  -> Outbound reply adapter
```

The desktop pet stays the primary UI. Channel adapters are background services started and stopped from the manager page.

## Data Model

Add `channels` to `AppSettings`:

```ts
type ChannelProvider = "feishu" | "wechat";

type ChannelSettings = {
  enabled: boolean;
  provider: ChannelProvider;
  displayName: string;
  status: "disabled" | "starting" | "connected" | "error";
  accessMode: "pairing" | "allowlist";
  allowedPeers: ChannelPeer[];
  routeMode: "chat" | "agent";
};

type ChannelPeer = {
  id: string;
  channel: ChannelProvider;
  kind: "direct" | "group";
  name?: string;
  pairedAt?: string;
};
```

Feishu stores App ID/App Secret using the same safe-storage pattern as model API keys. WeChat stores only local plugin/sidecar configuration, not long-lived secrets owned by the plugin.

## Normalized Message Contract

Every inbound platform message becomes:

```ts
type ChannelMessage = {
  channel: "feishu" | "wechat";
  peerId: string;
  peerKind: "direct" | "group";
  text: string;
  attachments: ChannelAttachment[];
  receivedAt: string;
};
```

The router maps `channel + peerId` to a HaJiMi conversation. If no mapping exists, it creates a pending pairing conversation and sends a pairing instruction instead of executing the task.

## Remote Safety

Remote channels are treated as less trusted than desktop input:

- Unknown peers cannot run tasks until paired.
- Default remote route is chat mode.
- Office mode requires an explicit peer allowlist.
- Full access permission is never enabled automatically from a remote channel.
- Before running commands or editing files from a remote message, the existing permission mode still applies.
- Group messages only trigger when the bot is mentioned or a configured prefix is used.

## Pet Control From Models

Add a small pet-action tool surface that both desktop chat and remote channels can use when a model is configured:

```ts
type PetAction =
  | { type: "say"; text: string }
  | { type: "jump" }
  | { type: "runAround"; seconds?: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "mood"; mood: "idle" | "happy" | "working" | "failed" }
  | { type: "openChat" }
  | { type: "stopMovement" };
```

For OpenAI-compatible chat mode this can be exposed as function tools. For Claude Agent SDK mode, it can be represented as a HaJiMi-specific tool or interpreted from structured response blocks. The renderer applies pet actions through existing pet-stage state and IPC broadcasts.

## Manager UI

Add a `通道` page to the left navigation:

- Feishu card: App ID, App Secret, start/stop, status, test message, allowed peers.
- WeChat card: plugin/sidecar path or API endpoint, QR login/start/stop, status, allowed peers.
- Shared access panel: pairing mode, allowlist, default route mode, current channel sessions.

Keep the visual style aligned with the current Codex-like manager: white, compact, calm, no promotional hero layout.

## Testing

Use source-level and unit tests first:

- Settings hydration/dehydration preserves channel config and encrypts Feishu secret.
- Channel normalizer turns Feishu and WeChat events into `ChannelMessage`.
- Router blocks unknown peers and permits paired peers.
- Manager page exposes Feishu and WeChat channel controls.
- Pet-action parser rejects unsafe or malformed action payloads.

End-to-end live tests are manual because Feishu and WeChat require real accounts, app credentials, and QR login.

## Implementation Plan

1. Add channel settings types, defaults, safe-storage persistence, and tests.
2. Add normalized channel message and router modules with pairing/allowlist tests.
3. Add manager `通道` page with Feishu and WeChat configuration cards.
4. Add Feishu adapter skeleton and status/test actions.
5. Add WeChat plugin/sidecar adapter skeleton and status/test actions.
6. Add pet-action tool contract and apply actions in the renderer.
7. Wire remote messages into existing chat/agent execution paths.
8. Package as a new release after local tests pass.

## Non-Goals For First Phase

- No direct implementation of undocumented WeChat protocol internals.
- No automatic full-access mode for remote messages.
- No public webhook requirement for Feishu; prefer long connection.
- No cloud server dependency for the default local Windows app.
