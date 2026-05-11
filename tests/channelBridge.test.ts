import { describe, expect, it } from "vitest";
import { handleInboundChannelMessage } from "../electron/channelBridge";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";

describe("channel bridge", () => {
  it("appends inbound channel messages to the active conversation and returns a reply", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      activeConversationId: "office-active",
      conversations: [
        {
          id: "office-active",
          title: "办公会话",
          mode: "chat" as const,
          messages: [],
          updatedAt: "2026-05-11T00:00:00.000Z"
        }
      ],
      channels: DEFAULT_SETTINGS.channels.map((channel) => channel.provider === "wechat"
        ? { ...channel, enabled: true, accessMode: "pairing" as const }
        : channel)
    };

    const result = await handleInboundChannelMessage(
      settings,
      {
        channel: "wechat",
        peerId: "wx_new",
        peerKind: "direct",
        text: "帮我看当前项目",
        attachments: [],
        receivedAt: "2026-05-11T00:00:00.000Z"
      },
      async ({ messages, text }) => {
        expect(text).toBe("帮我看当前项目");
        expect(messages.at(-1)).toEqual({ role: "user", content: "帮我看当前项目" });
        return { role: "assistant", content: "已经接到当前办公会话。" };
      }
    );

    expect(result.reply).toBe("已经接到当前办公会话。");
    expect(result.settings.activeConversationId).toBe("office-active");
    expect(result.settings.conversations.find((item) => item.id === "office-active")?.messages).toEqual([
      { role: "user", content: "帮我看当前项目" },
      { role: "assistant", content: "已经接到当前办公会话。" }
    ]);
    expect(result.settings.channels.find((item) => item.provider === "wechat")?.allowedPeers).toMatchObject([
      { id: "wx_new", channel: "wechat", kind: "direct" }
    ]);
  });
});
