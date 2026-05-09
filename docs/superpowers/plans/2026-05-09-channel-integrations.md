# Channel Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-phase Feishu and WeChat channel support plus model-driven desktop pet actions.

**Architecture:** Add a channel layer that normalizes Feishu and WeChat messages, applies pairing/allowlist rules, routes approved messages into existing chat or office-agent execution, and sends replies through channel adapters. Keep platform-specific login and transport isolated behind adapters so the Electron app stays channel-agnostic.

**Tech Stack:** Electron main IPC, React manager UI, TypeScript, Vitest, existing safe-storage settings persistence, OpenAI-compatible tool calls, Claude Agent SDK path for advanced office mode.

---

## File Structure

- Create `src/lib/channels.ts`: shared channel types, default settings, peer matching, routing helpers.
- Create `src/lib/channelRouter.ts`: converts inbound channel messages into route decisions and conversation ids.
- Create `src/lib/petActions.ts`: validates and serializes model-triggered pet actions.
- Create `electron/channelAdapters.ts`: Feishu and WeChat adapter status/start/stop/test skeletons.
- Modify `electron/settingsStore.ts`: add `channels` settings and persistence.
- Modify `electron/main.ts`: expose channel IPC and pet action broadcast IPC.
- Modify `electron/preload.ts` and `electron/preload.cjs`: expose channel APIs to renderer.
- Modify `src/global.d.ts`: add channel APIs and pet action IPC types.
- Modify `src/App.tsx`: receive pet action broadcasts and pass channel actions to manager.
- Modify `src/components/ManagerPage.tsx`: add `通道` navigation page.
- Modify `electron/chatClient.ts` and `electron/agentClient.ts`: add optional pet action tool support for chat/agent responses only after validation.
- Add tests: `tests/channelSettings.test.ts`, `tests/channelRouter.test.ts`, `tests/channelAdaptersSource.test.ts`, `tests/petActions.test.ts`, `tests/channelManagerSource.test.ts`.

## Task 1: Channel Settings And Defaults

**Files:**
- Create: `src/lib/channels.ts`
- Modify: `electron/settingsStore.ts`
- Test: `tests/channelSettings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";
import { defaultChannelSettings, findAllowedPeer } from "../src/lib/channels";

describe("channel settings", () => {
  it("enables first-phase Feishu and WeChat settings by default but keeps them disabled", () => {
    expect(DEFAULT_SETTINGS.channels.map((channel) => channel.provider)).toEqual(["feishu", "wechat"]);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.enabled === false)).toBe(true);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.accessMode === "pairing")).toBe(true);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.routeMode === "chat")).toBe(true);
  });

  it("finds allowed peers by channel, kind, and id", () => {
    const channels = defaultChannelSettings().map((channel) => channel.provider === "feishu"
      ? {
        ...channel,
        allowedPeers: [{ id: "ou_1", channel: "feishu" as const, kind: "direct" as const, name: "User" }]
      }
      : channel);

    expect(findAllowedPeer(channels, "feishu", "direct", "ou_1")?.name).toBe("User");
    expect(findAllowedPeer(channels, "wechat", "direct", "ou_1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- --run tests/channelSettings.test.ts`

Expected: fail because `channels` and `src/lib/channels.ts` do not exist.

- [ ] **Step 3: Implement minimal channel settings**

Add `src/lib/channels.ts`:

```ts
export type ChannelProvider = "feishu" | "wechat";
export type ChannelPeerKind = "direct" | "group";
export type ChannelStatus = "disabled" | "starting" | "connected" | "error";
export type ChannelAccessMode = "pairing" | "allowlist";
export type ChannelRouteMode = "chat" | "agent";

export type ChannelPeer = {
  id: string;
  channel: ChannelProvider;
  kind: ChannelPeerKind;
  name?: string;
  pairedAt?: string;
};

export type ChannelSettings = {
  enabled: boolean;
  provider: ChannelProvider;
  displayName: string;
  status: ChannelStatus;
  accessMode: ChannelAccessMode;
  allowedPeers: ChannelPeer[];
  routeMode: ChannelRouteMode;
  feishu?: {
    appId: string;
    appSecret: string;
  };
  wechat?: {
    bridgeUrl: string;
    pluginCommand: string;
  };
};

export function defaultChannelSettings(): ChannelSettings[] {
  return [
    {
      enabled: false,
      provider: "feishu",
      displayName: "飞书",
      status: "disabled",
      accessMode: "pairing",
      allowedPeers: [],
      routeMode: "chat",
      feishu: { appId: "", appSecret: "" }
    },
    {
      enabled: false,
      provider: "wechat",
      displayName: "微信",
      status: "disabled",
      accessMode: "pairing",
      allowedPeers: [],
      routeMode: "chat",
      wechat: {
        bridgeUrl: "http://127.0.0.1:18011",
        pluginCommand: "openclaw channels login --channel openclaw-weixin"
      }
    }
  ];
}

export function findAllowedPeer(
  channels: ChannelSettings[],
  channel: ChannelProvider,
  kind: ChannelPeerKind,
  id: string
): ChannelPeer | undefined {
  return channels
    .find((item) => item.provider === channel)
    ?.allowedPeers.find((peer) => peer.channel === channel && peer.kind === kind && peer.id === id);
}
```

Modify `electron/settingsStore.ts`:

```ts
import type { ChannelSettings } from "../src/lib/channels.js";
import { defaultChannelSettings } from "../src/lib/channels.js";

export type AppSettings = {
  // existing fields
  channels: ChannelSettings[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  // existing fields
  channels: defaultChannelSettings(),
};
```

In `loadSettings()` ENOENT branch and `hydrate()`, clone or default channels:

```ts
channels: cloneChannels(stored.channels),
```

Add helper:

```ts
function cloneChannels(channels?: ChannelSettings[]): ChannelSettings[] {
  const defaults = defaultChannelSettings();
  return defaults.map((defaultChannel) => {
    const stored = channels?.find((channel) => channel.provider === defaultChannel.provider);
    return {
      ...defaultChannel,
      ...stored,
      allowedPeers: stored?.allowedPeers ? [...stored.allowedPeers] : [],
      feishu: { ...defaultChannel.feishu, ...stored?.feishu },
      wechat: { ...defaultChannel.wechat, ...stored?.wechat }
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- --run tests/channelSettings.test.ts`

Expected: pass.

## Task 2: Channel Router

**Files:**
- Create: `src/lib/channelRouter.ts`
- Test: `tests/channelRouter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";
import { routeChannelMessage } from "../src/lib/channelRouter";

describe("channel router", () => {
  it("blocks unknown peers with a pairing response", () => {
    const decision = routeChannelMessage(DEFAULT_SETTINGS, {
      channel: "feishu",
      peerId: "ou_unknown",
      peerKind: "direct",
      text: "帮我看 README",
      attachments: [],
      receivedAt: "2026-05-09T00:00:00.000Z"
    });

    expect(decision.type).toBe("pairing-required");
    expect(decision.reply).toContain("配对");
  });

  it("routes allowed peers to chat or agent mode", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      channels: DEFAULT_SETTINGS.channels.map((channel) => channel.provider === "wechat"
        ? {
          ...channel,
          routeMode: "agent" as const,
          allowedPeers: [{ id: "wx_1", channel: "wechat" as const, kind: "direct" as const }]
        }
        : channel)
    };

    const decision = routeChannelMessage(settings, {
      channel: "wechat",
      peerId: "wx_1",
      peerKind: "direct",
      text: "跑到左边",
      attachments: [],
      receivedAt: "2026-05-09T00:00:00.000Z"
    });

    expect(decision).toMatchObject({ type: "route", mode: "agent", conversationId: "channel-wechat-direct-wx_1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- --run tests/channelRouter.test.ts`

Expected: fail because `routeChannelMessage` does not exist.

- [ ] **Step 3: Implement minimal router**

Add `src/lib/channelRouter.ts`:

```ts
import type { AppSettings, PetConversationMode } from "../../electron/settingsStore.js";
import type { ChannelPeerKind, ChannelProvider } from "./channels.js";
import { findAllowedPeer } from "./channels.js";

export type ChannelAttachment = {
  id: string;
  name?: string;
  mimeType?: string;
  url?: string;
};

export type ChannelMessage = {
  channel: ChannelProvider;
  peerId: string;
  peerKind: ChannelPeerKind;
  text: string;
  attachments: ChannelAttachment[];
  receivedAt: string;
};

export type ChannelRouteDecision =
  | { type: "pairing-required"; reply: string }
  | { type: "ignored"; reply?: string }
  | { type: "route"; mode: PetConversationMode; conversationId: string; text: string };

export function routeChannelMessage(settings: AppSettings, message: ChannelMessage): ChannelRouteDecision {
  const channel = settings.channels.find((item) => item.provider === message.channel);
  if (!channel?.enabled) {
    return { type: "ignored", reply: "这个通道还没有启用。" };
  }

  const allowed = findAllowedPeer(settings.channels, message.channel, message.peerKind, message.peerId);
  if (!allowed) {
    return {
      type: "pairing-required",
      reply: `需要先在哈基Mi的通道页完成配对：${message.channel}:${message.peerId}`
    };
  }

  return {
    type: "route",
    mode: channel.routeMode,
    conversationId: `channel-${message.channel}-${message.peerKind}-${sanitizeId(message.peerId)}`,
    text: message.text
  };
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- --run tests/channelRouter.test.ts`

Expected: pass.

## Task 3: Channel Adapter Skeletons And IPC

**Files:**
- Create: `electron/channelAdapters.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `tests/channelAdaptersSource.test.ts`

- [ ] **Step 1: Write the failing source test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterSource = readFileSync(join(process.cwd(), "electron", "channelAdapters.ts"), "utf8");
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");

describe("channel adapter source", () => {
  it("has Feishu and WeChat adapter entry points", () => {
    expect(adapterSource).toContain("startChannelAdapter");
    expect(adapterSource).toContain("stopChannelAdapter");
    expect(adapterSource).toContain("testChannelAdapter");
    expect(adapterSource).toContain("provider === \"feishu\"");
    expect(adapterSource).toContain("provider === \"wechat\"");
  });

  it("exposes channel IPC to the renderer", () => {
    expect(mainSource).toContain('"pet:start-channel"');
    expect(mainSource).toContain('"pet:stop-channel"');
    expect(mainSource).toContain('"pet:test-channel"');
    expect(preloadSource).toContain("startChannel");
    expect(preloadSource).toContain("stopChannel");
    expect(preloadSource).toContain("testChannel");
    expect(globalSource).toContain("startChannel");
    expect(globalSource).toContain("testChannel");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- --run tests/channelAdaptersSource.test.ts`

Expected: fail because adapter and IPC code do not exist.

- [ ] **Step 3: Implement adapter skeletons**

Create `electron/channelAdapters.ts`:

```ts
import type { ChannelProvider, ChannelSettings } from "../src/lib/channels.js";

export type ChannelAdapterResult = {
  provider: ChannelProvider;
  status: "disabled" | "starting" | "connected" | "error";
  message: string;
};

export async function startChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  if (channel.provider === "feishu") {
    return channel.feishu?.appId.trim() && channel.feishu.appSecret.trim()
      ? { provider: "feishu", status: "connected", message: "飞书通道配置已就绪，等待长连接接入。" }
      : { provider: "feishu", status: "error", message: "请先填写飞书 App ID 和 App Secret。" };
  }

  if (channel.provider === "wechat") {
    return channel.wechat?.bridgeUrl.trim()
      ? { provider: "wechat", status: "connected", message: "微信插件桥接地址已就绪。" }
      : { provider: "wechat", status: "error", message: "请先填写微信插件桥接地址。" };
  }

  return { provider: channel.provider, status: "error", message: "未知通道。" };
}

export async function stopChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  return { provider: channel.provider, status: "disabled", message: `${channel.displayName} 已停止。` };
}

export async function testChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  return startChannelAdapter(channel);
}
```

Add IPC handlers in `electron/main.ts`:

```ts
ipcMain.handle("pet:start-channel", async (_event, provider: ChannelProvider) => {
  const settings = await settingsStore.loadSettings();
  const channel = settings.channels.find((item) => item.provider === provider);
  if (!channel) throw new Error("通道不存在。");
  return startChannelAdapter(channel);
});
```

Add matching `stop-channel` and `test-channel`; expose them in preload and `src/global.d.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- --run tests/channelAdaptersSource.test.ts`

Expected: pass.

## Task 4: Manager Channel Page

**Files:**
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/channelManagerSource.test.ts`

- [ ] **Step 1: Write the failing source test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");

describe("channel manager page", () => {
  it("adds a channel page with Feishu and WeChat controls", () => {
    expect(managerSource).toContain('type ManagerSection = "office" | "pets" | "models" | "channels" | "system"');
    expect(managerSource).toContain('label: "通道"');
    expect(managerSource).toContain("飞书机器人");
    expect(managerSource).toContain("微信插件");
    expect(managerSource).toContain("App ID");
    expect(managerSource).toContain("App Secret");
    expect(managerSource).toContain("桥接地址");
    expect(managerSource).toContain("启动通道");
    expect(managerSource).toContain("测试通道");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- --run tests/channelManagerSource.test.ts`

Expected: fail because the `通道` page does not exist.

- [ ] **Step 3: Add manager props and UI**

Extend `Props`:

```ts
onStartChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
onStopChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
onTestChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
```

Add nav item:

```ts
{ id: "channels", label: "通道", icon: MessageCircle }
```

Render when `section === "channels"`:

```tsx
<section className="manager-content manager-content-wide">
  <div className="content-heading">
    <div>
      <p className="eyebrow">HAJIMI CHANNELS</p>
      <h1>通道</h1>
      <p>把飞书和微信消息接入哈基Mi，让远程聊天也能进入当前办公能力。</p>
    </div>
  </div>
  <div className="channel-grid">
    {settings.channels.map((channel) => (
      <article className="manager-section" key={channel.provider}>
        <div className="section-title">
          <MessageCircle size={18} />
          <span>{channel.provider === "feishu" ? "飞书机器人" : "微信插件"}</span>
        </div>
        <label className="manager-toggle">
          <span>启用</span>
          <input type="checkbox" checked={channel.enabled} onChange={(event) => updateChannel(channel.provider, { enabled: event.target.checked })} />
        </label>
        {channel.provider === "feishu" ? (
          <>
            <label>App ID<input value={channel.feishu?.appId ?? ""} onChange={(event) => updateChannelSecret(channel.provider, "appId", event.target.value)} /></label>
            <label>App Secret<input type="password" value={channel.feishu?.appSecret ?? ""} onChange={(event) => updateChannelSecret(channel.provider, "appSecret", event.target.value)} /></label>
          </>
        ) : (
          <>
            <label>桥接地址<input value={channel.wechat?.bridgeUrl ?? ""} onChange={(event) => updateChannelBridge(channel.provider, "bridgeUrl", event.target.value)} /></label>
            <label>插件命令<input value={channel.wechat?.pluginCommand ?? ""} onChange={(event) => updateChannelBridge(channel.provider, "pluginCommand", event.target.value)} /></label>
          </>
        )}
        <div className="network-actions">
          <button className="secondary-command" onClick={() => void onStartChannel(channel.provider)}>启动通道</button>
          <button className="secondary-command" onClick={() => void onTestChannel(channel.provider)}>测试通道</button>
          <button className="secondary-command" onClick={() => void onStopChannel(channel.provider)}>停止通道</button>
        </div>
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- --run tests/channelManagerSource.test.ts`

Expected: pass.

## Task 5: Pet Action Tool Contract

**Files:**
- Create: `src/lib/petActions.ts`
- Modify: `src/App.tsx`
- Modify: `electron/main.ts`
- Test: `tests/petActions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readPetAction } from "../src/lib/petActions";

describe("pet actions", () => {
  it("accepts known safe pet actions", () => {
    expect(readPetAction({ type: "jump" })).toEqual({ type: "jump" });
    expect(readPetAction({ type: "say", text: "你好" })).toEqual({ type: "say", text: "你好" });
    expect(readPetAction({ type: "moveTo", x: 10, y: 20 })).toEqual({ type: "moveTo", x: 10, y: 20 });
  });

  it("rejects malformed actions", () => {
    expect(readPetAction({ type: "moveTo", x: "left", y: 20 })).toBeUndefined();
    expect(readPetAction({ type: "say", text: "" })).toBeUndefined();
    expect(readPetAction({ type: "deleteEverything" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- --run tests/petActions.test.ts`

Expected: fail because `readPetAction` does not exist.

- [ ] **Step 3: Implement validator**

Add `src/lib/petActions.ts`:

```ts
export type PetAction =
  | { type: "say"; text: string }
  | { type: "jump" }
  | { type: "runAround"; seconds?: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "mood"; mood: "idle" | "happy" | "working" | "failed" }
  | { type: "openChat" }
  | { type: "stopMovement" };

export function readPetAction(value: unknown): PetAction | undefined {
  if (!value || typeof value !== "object") return undefined;
  const typed = value as Record<string, unknown>;
  if (typed.type === "jump" || typed.type === "openChat" || typed.type === "stopMovement") {
    return { type: typed.type };
  }
  if (typed.type === "say" && typeof typed.text === "string" && typed.text.trim()) {
    return { type: "say", text: typed.text.trim().slice(0, 140) };
  }
  if (typed.type === "moveTo" && typeof typed.x === "number" && typeof typed.y === "number") {
    return { type: "moveTo", x: Math.round(typed.x), y: Math.round(typed.y) };
  }
  if (typed.type === "runAround") {
    return { type: "runAround", seconds: typeof typed.seconds === "number" ? Math.max(1, Math.min(30, typed.seconds)) : undefined };
  }
  if (typed.type === "mood" && ["idle", "happy", "working", "failed"].includes(String(typed.mood))) {
    return { type: "mood", mood: typed.mood as PetAction extends { mood: infer M } ? M : never };
  }
  return undefined;
}
```

Wire renderer action handling after tests pass.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- --run tests/petActions.test.ts`

Expected: pass.

## Task 6: Final Verification And Release Prep

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npx.cmd tsc --noEmit
npm.cmd test -- --run
```

Expected: typecheck passes and all tests pass.

- [ ] **Step 2: Bump version**

Run: `npm.cmd version 0.1.29 --no-git-tag-version`

Expected: `package.json` and `package-lock.json` are updated to `0.1.29`.

- [ ] **Step 3: Update docs**

Add to `CHANGELOG.md`:

```md
## 0.1.29 - 2026-05-09

- Added first-phase Feishu and WeChat channel configuration.
- Added channel routing foundations and safe pairing/allowlist behavior.
- Added model-safe pet action validation for future chat-driven pet control.
```

Add to `README.md` installer table:

```md
| 0.1.29 | `HaJiMi-Setup-0.1.29.exe` | Adds first-phase Feishu/WeChat channel settings, routing foundations, and pet action controls. |
```

- [ ] **Step 4: Package installer**

Run: `npm.cmd run package:installer`

Expected: `dist/HaJiMi-Setup-0.1.29.exe` and `dist/latest.yml` are generated.

- [ ] **Step 5: Commit and tag**

Run:

```powershell
git add .
git commit -m "feat: add channel integration foundations"
git tag -a v0.1.29 -m "HaJiMi 0.1.29"
```

Expected: commit and tag are created.

- [ ] **Step 6: Push release**

Run:

```powershell
git push origin main
git push origin v0.1.29
```

Expected: GitHub Actions builds the installer and uploads release assets.

## Self-Review

- Spec coverage: Feishu, WeChat official/plugin model, channel normalization, safety, manager UI, pet action tooling, and tests are covered.
- Placeholder scan: no `TBD`, `TODO`, or undefined later work appears in the steps.
- Type consistency: `ChannelProvider`, `ChannelSettings`, `ChannelMessage`, `ChannelRouteDecision`, and `PetAction` are named consistently across tasks.
