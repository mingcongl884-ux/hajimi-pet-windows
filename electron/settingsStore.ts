import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "./chatClient.js";
import type { MovementIntensity } from "../src/lib/movement.js";

export type ApiSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
};

export type ChatModelPurpose = "chat" | "agent";
export type ModelProvider = "openai-compatible" | "claude-agent";

export type ModelProfile = ApiSettings & {
  id: string;
  name: string;
  provider: ModelProvider;
};

export type AgentPermissionMode = "default" | "auto-review" | "full-access";

export type AgentSettings = {
  workspaceDir: string;
  allowCommands: boolean;
  permissionMode: AgentPermissionMode;
};

export type HeartbeatSettings = {
  enabled: boolean;
  modelGreetingEnabled: boolean;
  collapseToBubbleEnabled: boolean;
  bubbleIdleSeconds: number;
  sentGreetingKeys: string[];
};

export type RemoteNotice = {
  id: string;
  title: string;
  message: string;
  url?: string;
  version?: string;
  publishedAt?: string;
};

export type NetworkSettings = {
  autoCheckEnabled: boolean;
  updateFeedUrl: string;
  noticeFeedUrl: string;
  readNoticeIds: string[];
  lastNoticeCheckAt?: string;
  lastUpdateCheckAt?: string;
};

export type PetConversationMode = "chat" | "agent";

export type PetConversation = {
  id: string;
  title: string;
  mode: PetConversationMode;
  messages: ChatMessage[];
  updatedAt: string;
};

export type AppSettings = {
  activePetId: string;
  activePetIds: string[];
  petDisplayNames: Record<string, string>;
  petScale: number;
  windowPosition?: {
    x: number;
    y: number;
  };
  petWindowPositions?: Record<string, { x: number; y: number }>;
  movementEnabled: boolean;
  movementIntensity: MovementIntensity;
  playTogetherEnabled: boolean;
  api: ApiSettings;
  models: ModelProfile[];
  activeChatModelId: string;
  activeAgentModelId: string;
  agent: AgentSettings;
  heartbeat: HeartbeatSettings;
  network: NetworkSettings;
  activeConversationId: string;
  conversations: PetConversation[];
};

export type SafeStorageAdapter = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

export const GITHUB_UPDATE_FEED_URL =
  "https://github.com/mingcongl884-ux/hajimi-pet-windows/releases/latest/download";
export const GITHUB_NOTICE_FEED_URL =
  "https://raw.githubusercontent.com/mingcongl884-ux/hajimi-pet-windows/main/notices.json";

type StoredModelProfile = Omit<ModelProfile, "apiKey"> & {
  apiKey?: string;
  apiKeyEncrypted?: string;
  apiKeyStorage?: "safe-storage" | "plain";
};

type StoredSettings = Omit<AppSettings, "api" | "models"> & {
  api: Omit<ApiSettings, "apiKey"> & {
    apiKey?: string;
    apiKeyEncrypted?: string;
    apiKeyStorage?: "safe-storage" | "plain";
  };
  models?: StoredModelProfile[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  activePetId: "xiaomi",
  activePetIds: ["xiaomi"],
  petDisplayNames: {},
  petScale: 0.85,
  movementEnabled: true,
  movementIntensity: "lively",
  playTogetherEnabled: true,
  api: {
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4.1-mini",
    systemPrompt: "You are HaJiMi, a friendly desktop pet."
  },
  models: [
    {
      id: "default",
      name: "默认模型",
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      model: "gpt-4.1-mini",
      systemPrompt: "You are HaJiMi, a friendly desktop pet."
    }
  ],
  activeChatModelId: "default",
  activeAgentModelId: "default",
  agent: {
    workspaceDir: "",
    allowCommands: false,
    permissionMode: "default"
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
    updateFeedUrl: GITHUB_UPDATE_FEED_URL,
    noticeFeedUrl: GITHUB_NOTICE_FEED_URL,
    readNoticeIds: []
  },
  activeConversationId: "default",
  conversations: [
    {
      id: "default",
      title: "新会话",
      mode: "chat",
      messages: [],
      updatedAt: ""
    }
  ]
};

export class SettingsStore {
  private readonly filePath: string;

  constructor(
    private readonly userDataDir: string,
    private readonly safeStorage?: SafeStorageAdapter
  ) {
    this.filePath = join(userDataDir, "settings.json");
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const stored = JSON.parse(raw) as StoredSettings;
      return this.hydrate(stored);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          ...DEFAULT_SETTINGS,
          api: { ...DEFAULT_SETTINGS.api },
          models: DEFAULT_SETTINGS.models.map((model) => ({ ...model })),
          activePetIds: [...DEFAULT_SETTINGS.activePetIds],
          petDisplayNames: { ...DEFAULT_SETTINGS.petDisplayNames },
          agent: { ...DEFAULT_SETTINGS.agent },
          heartbeat: { ...DEFAULT_SETTINGS.heartbeat, sentGreetingKeys: [] },
          network: { ...DEFAULT_SETTINGS.network, readNoticeIds: [] },
          conversations: DEFAULT_SETTINGS.conversations.map((conversation) => ({ ...conversation }))
        };
      }
      throw error;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true });
    const stored = this.dehydrate(settings);
    await writeFile(this.filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }

  private hydrate(stored: StoredSettings): AppSettings {
    let apiKey = stored.api.apiKey ?? "";
    if (stored.api.apiKeyEncrypted && this.safeStorage?.isEncryptionAvailable()) {
      apiKey = this.safeStorage.decryptString(Buffer.from(stored.api.apiKeyEncrypted, "base64"));
    }

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      activePetIds: stored.activePetIds?.length ? stored.activePetIds.slice(0, 2) : [stored.activePetId || "xiaomi"],
      petDisplayNames: stored.petDisplayNames ?? {},
      api: {
        ...DEFAULT_SETTINGS.api,
        ...stored.api,
        apiKey
      },
      models: stored.models?.length
        ? stored.models.map((model) => ({
          id: model.id,
          name: model.name,
          provider: this.readModelProvider(model),
          baseUrl: model.baseUrl,
          apiKey: this.readStoredModelApiKey(model),
          model: model.model,
          systemPrompt: model.systemPrompt
        }))
        : [{
          id: "default",
          name: "默认模型",
          provider: "openai-compatible",
          baseUrl: stored.api.baseUrl || DEFAULT_SETTINGS.api.baseUrl,
          apiKey,
          model: stored.api.model || DEFAULT_SETTINGS.api.model,
          systemPrompt: stored.api.systemPrompt || DEFAULT_SETTINGS.api.systemPrompt
        }],
      activeChatModelId: stored.activeChatModelId || "default",
      activeAgentModelId: stored.activeAgentModelId || stored.activeChatModelId || "default",
      agent: {
        ...DEFAULT_SETTINGS.agent,
        ...stored.agent,
        permissionMode: this.readAgentPermissionMode(stored.agent)
      },
      heartbeat: {
        ...DEFAULT_SETTINGS.heartbeat,
        ...stored.heartbeat,
        sentGreetingKeys: stored.heartbeat?.sentGreetingKeys ?? []
      },
      network: {
        ...DEFAULT_SETTINGS.network,
        ...stored.network,
        readNoticeIds: stored.network?.readNoticeIds ?? []
      },
      conversations: stored.conversations?.length
        ? stored.conversations
        : DEFAULT_SETTINGS.conversations.map((conversation) => ({ ...conversation })),
      activeConversationId: stored.activeConversationId || DEFAULT_SETTINGS.activeConversationId
    };
  }

  private dehydrate(settings: AppSettings): StoredSettings {
    const { apiKey, ...apiWithoutKey } = settings.api;
    const storedModels = settings.models.map((model) => {
      const { apiKey: modelApiKey, ...modelWithoutKey } = model;
      if (modelApiKey && this.safeStorage?.isEncryptionAvailable()) {
        return {
          ...modelWithoutKey,
          apiKeyEncrypted: this.safeStorage.encryptString(modelApiKey).toString("base64"),
          apiKeyStorage: "safe-storage" as const
        };
      }
      return {
        ...modelWithoutKey,
        apiKey: modelApiKey,
        apiKeyStorage: "plain" as const
      };
    });

    if (apiKey && this.safeStorage?.isEncryptionAvailable()) {
      return {
        ...settings,
        models: storedModels,
        api: {
          ...apiWithoutKey,
          apiKeyEncrypted: this.safeStorage.encryptString(apiKey).toString("base64"),
          apiKeyStorage: "safe-storage"
        }
      };
    }

    return {
      ...settings,
      models: storedModels,
      api: {
        ...apiWithoutKey,
        apiKey,
        apiKeyStorage: "plain"
      }
    };
  }

  private readStoredModelApiKey(model: StoredModelProfile): string {
    if (model.apiKeyEncrypted && this.safeStorage?.isEncryptionAvailable()) {
      return this.safeStorage.decryptString(Buffer.from(model.apiKeyEncrypted, "base64"));
    }
    return model.apiKey ?? "";
  }

  private readModelProvider(model: Partial<ModelProfile>): ModelProvider {
    return model.provider === "claude-agent" ? "claude-agent" : "openai-compatible";
  }

  private readAgentPermissionMode(agent: Partial<AgentSettings> | undefined): AgentPermissionMode {
    if (agent?.permissionMode === "default" || agent?.permissionMode === "auto-review" || agent?.permissionMode === "full-access") {
      return agent.permissionMode;
    }
    return agent?.allowCommands ? "auto-review" : "default";
  }
}
