import { describe, expect, it } from "vitest";
import {
  ensureModelProfiles,
  getActiveModelSettings,
  getPetModelSettings,
  upsertModelProfile
} from "../src/lib/modelProfiles";
import { DEFAULT_SETTINGS, type AppSettings } from "../electron/settingsStore";

const baseSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  activePetId: "xiaomi",
  activePetIds: ["xiaomi"],
  petModelBindings: {},
  petDisplayNames: {},
  petScale: 1,
  movementEnabled: false,
  movementIntensity: "normal",
  playTogetherEnabled: true,
  api: {
    baseUrl: "https://api.example.com",
    apiKey: "secret",
    model: "gpt-4.1-mini",
    systemPrompt: "Be kind."
  },
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
  activeConversationId: "default",
  conversations: [],
  models: [],
  activeChatModelId: "",
  activeAgentModelId: ""
};

describe("model profiles", () => {
  it("migrates legacy api settings into a default model profile", () => {
    const settings = ensureModelProfiles(baseSettings);

    expect(settings.models).toMatchObject([
      {
        id: "default",
        name: "默认模型",
        provider: "openai-compatible",
        baseUrl: "https://api.example.com",
        model: "gpt-4.1-mini"
      }
    ]);
    expect(settings.activeChatModelId).toBe("default");
    expect(settings.activeAgentModelId).toBe("default");
  });

  it("uses separate active chat and agent models", () => {
    const settings = ensureModelProfiles({
      ...baseSettings,
      models: [
        { id: "chat", name: "Chat", provider: "openai-compatible", baseUrl: "https://chat.example.com", apiKey: "a", model: "chat-model", systemPrompt: "chat" },
        { id: "agent", name: "Agent", provider: "claude-agent", baseUrl: "https://api.anthropic.com", apiKey: "b", model: "claude-sonnet-4-6", systemPrompt: "agent" }
      ],
      activeChatModelId: "chat",
      activeAgentModelId: "agent"
    });

    expect(getActiveModelSettings(settings, "chat").model).toBe("chat-model");
    expect(getActiveModelSettings(settings, "agent").provider).toBe("claude-agent");
  });

  it("upserts model profiles and keeps active ids valid", () => {
    const settings = upsertModelProfile(ensureModelProfiles(baseSettings), {
      id: "new-model",
      name: "New Model",
      provider: "openai-compatible",
      baseUrl: "https://new.example.com",
      apiKey: "key",
      model: "new",
      systemPrompt: "system"
    });

    expect(settings.models).toHaveLength(2);
    expect(getActiveModelSettings({ ...settings, activeChatModelId: "new-model" }, "chat").baseUrl)
      .toBe("https://new.example.com");
  });

  it("resolves a pet-specific brain model and falls back to the active purpose model", () => {
    const settings = ensureModelProfiles({
      ...baseSettings,
      petModelBindings: {
        imported: "pet-brain",
        missing: "deleted-model"
      },
      models: [
        { id: "default", name: "Default", provider: "openai-compatible", baseUrl: "https://chat.example.com", apiKey: "a", model: "chat-model", systemPrompt: "chat" },
        { id: "pet-brain", name: "Pet Brain", provider: "openai-compatible", baseUrl: "https://pet.example.com", apiKey: "b", model: "pet-model", systemPrompt: "pet" }
      ],
      activeChatModelId: "default",
      activeAgentModelId: "default"
    });

    expect(getPetModelSettings(settings, "imported", "chat").model).toBe("pet-model");
    expect(getPetModelSettings(settings, "missing", "chat").model).toBe("chat-model");
    expect(ensureModelProfiles(settings).petModelBindings).toEqual({ imported: "pet-brain" });
  });
});
