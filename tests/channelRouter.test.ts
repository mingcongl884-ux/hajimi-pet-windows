import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";
import { routeChannelMessage } from "../src/lib/channelRouter";

describe("channel router", () => {
  it("blocks unknown peers with a pairing response", () => {
    const decision = routeChannelMessage({
      ...DEFAULT_SETTINGS,
      channels: DEFAULT_SETTINGS.channels.map((channel) => channel.provider === "feishu"
        ? { ...channel, enabled: true, accessMode: "allowlist" as const }
        : channel)
    }, {
      channel: "feishu",
      peerId: "ou_unknown",
      peerKind: "direct",
      text: "帮我看 README",
      attachments: [],
      receivedAt: "2026-05-09T00:00:00.000Z"
    });

    expect(decision.type).toBe("pairing-required");
    if (decision.type !== "pairing-required") {
      throw new Error("Expected pairing-required decision.");
    }
    expect(decision.reply).toContain("配对");
  });

  it("routes allowed peers to the current active conversation", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      activeConversationId: "office-active",
      conversations: [
        {
          id: "office-active",
          title: "办公会话",
          mode: "chat" as const,
          messages: [],
          updatedAt: "2026-05-09T00:00:00.000Z"
        }
      ],
      channels: DEFAULT_SETTINGS.channels.map((channel) => channel.provider === "wechat"
        ? {
          ...channel,
          enabled: true,
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

    expect(decision).toMatchObject({ type: "route", mode: "agent", conversationId: "office-active" });
  });

  it("auto pairs new peers when a channel is in pairing mode", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      activeConversationId: "office-active",
      conversations: [
        {
          id: "office-active",
          title: "办公会话",
          mode: "chat" as const,
          messages: [],
          updatedAt: "2026-05-09T00:00:00.000Z"
        }
      ],
      channels: DEFAULT_SETTINGS.channels.map((channel) => channel.provider === "wechat"
        ? { ...channel, enabled: true, accessMode: "pairing" as const }
        : channel)
    };

    const decision = routeChannelMessage(settings, {
      channel: "wechat",
      peerId: "wx_new",
      peerKind: "direct",
      text: "同步到当前会话",
      attachments: [],
      receivedAt: "2026-05-09T00:00:00.000Z"
    });

    expect(decision).toMatchObject({
      type: "route",
      conversationId: "office-active",
      peerToAllow: {
        id: "wx_new",
        channel: "wechat",
        kind: "direct",
        pairedAt: "2026-05-09T00:00:00.000Z"
      }
    });
  });
});
