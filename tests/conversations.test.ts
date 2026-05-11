import { describe, expect, it } from "vitest";
import {
  appendConversationMessages,
  createConversation,
  deleteConversation,
  ensureActiveConversation,
  renameConversation
} from "../src/lib/conversations";
import { DEFAULT_SETTINGS, type AppSettings } from "../electron/settingsStore";

const baseSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  activePetId: "xiaomi",
  activePetIds: ["xiaomi"],
  petDisplayNames: {},
  petScale: 1,
  movementEnabled: false,
  movementIntensity: "normal",
  playTogetherEnabled: true,
  api: {
    baseUrl: "https://api.example.com",
    apiKey: "",
    model: "gpt-4.1-mini",
    systemPrompt: "Be kind."
  },
  models: [
    {
      id: "default",
      name: "默认模型",
      provider: "openai-compatible",
      baseUrl: "https://api.example.com",
      apiKey: "",
      model: "gpt-4.1-mini",
      systemPrompt: "Be kind."
    }
  ],
  activeChatModelId: "default",
  activeAgentModelId: "default",
  agent: {
    workspaceDir: "",
    allowCommands: true,
    permissionMode: "auto-review"
  },
  heartbeat: {
    enabled: true,
    modelGreetingEnabled: true,
    collapseToBubbleEnabled: true,
    bubbleIdleSeconds: 15,
    sentGreetingKeys: []
  },
  network: {
    autoCheckEnabled: true,
    updateFeedUrl: "",
    noticeFeedUrl: "",
    readNoticeIds: []
  },
  activeConversationId: "",
  conversations: []
};

describe("conversation helpers", () => {
  it("creates a default active conversation when none exists", () => {
    const settings = ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z");

    expect(settings.activeConversationId).toBe("default");
    expect(settings.conversations).toMatchObject([
      {
        id: "default",
        title: "新会话",
        mode: "chat",
        messages: [],
        updatedAt: "2026-05-08T10:00:00.000Z"
      }
    ]);
  });

  it("creates a new active conversation with a generated title", () => {
    const settings = createConversation(
      ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z"),
      "agent",
      "2026-05-08T10:01:00.000Z",
      "c-1"
    );

    expect(settings.activeConversationId).toBe("c-1");
    expect(settings.conversations.at(-1)).toMatchObject({
      id: "c-1",
      title: "办公会话 2",
      mode: "agent",
      messages: []
    });
  });

  it("updates title from the first user message and appends assistant response", () => {
    const settings = appendConversationMessages(
      ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z"),
      "default",
      [
        { role: "user", content: "请帮我整理 README 文档并跑测试" },
        { role: "assistant", content: "已完成。" }
      ],
      "agent",
      "2026-05-08T10:02:00.000Z"
    );

    expect(settings.conversations[0].title).toBe("请帮我整理 README 文档...");
    expect(settings.conversations[0].mode).toBe("agent");
    expect(settings.conversations[0].messages).toHaveLength(2);
  });

  it("keeps assistant processing duration on conversation messages", () => {
    const settings = appendConversationMessages(
      ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z"),
      "default",
      [{ role: "assistant", content: "Done.", durationMs: 45600 }],
      "chat",
      "2026-05-08T10:02:00.000Z"
    );

    expect(settings.conversations[0].messages[0]).toMatchObject({
      role: "assistant",
      content: "Done.",
      durationMs: 45600
    });
  });

  it("keeps at least one conversation after deleting the active one", () => {
    const withDefault = ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z");
    const withSecond = createConversation(withDefault, "chat", "2026-05-08T10:01:00.000Z", "c-2");
    const deleted = deleteConversation(withSecond, "c-2", "2026-05-08T10:03:00.000Z");

    expect(deleted.activeConversationId).toBe("default");
    expect(deleted.conversations.map((conversation) => conversation.id)).toEqual(["default"]);
  });

  it("renames a conversation without changing its messages", () => {
    const settings = ensureActiveConversation(baseSettings, "2026-05-08T10:00:00.000Z");
    const renamed = renameConversation(settings, "default", "  新名字  ", "2026-05-08T10:04:00.000Z");

    expect(renamed.conversations[0]).toMatchObject({
      id: "default",
      title: "新名字",
      updatedAt: "2026-05-08T10:04:00.000Z"
    });
  });
});
