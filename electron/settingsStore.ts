import { mkdir, rename, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "./chatClient.js";
import type { ChannelSettings } from "../src/lib/channels.js";
import { cloneChannelSettings, defaultChannelSettings } from "../src/lib/channels.js";
import type { MovementIntensity } from "../src/lib/movement.js";
import { ensureProjects } from "../src/lib/projects.js";
import type { RemoteBridgeSettings } from "../src/lib/remoteBridge.js";
import { cloneRemoteBridgeSettings, defaultRemoteBridgeSettings } from "../src/lib/remoteBridge.js";

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

export type AgentProject = {
  id: string;
  name: string;
  path: string;
  updatedAt: string;
  pinned?: boolean;
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
  projectId?: string;
  messages: ChatMessage[];
  updatedAt: string;
};

export type AppSettings = {
  activePetId: string;
  activePetIds: string[];
  petModelBindings: Record<string, string>;
  petDisplayNames: Record<string, string>;
  petScale: number;
  windowPosition?: {
    x: number;
    y: number;
  };
  petWindowPositions?: Record<string, { x: number; y: number }>;
  movementEnabled: boolean;
  movementIntensity: MovementIntensity;
  keyboardControlEnabled: boolean;
  playTogetherEnabled: boolean;
  api: ApiSettings;
  models: ModelProfile[];
  activeChatModelId: string;
  activeAgentModelId: string;
  agent: AgentSettings;
  activeProjectId: string;
  projects: AgentProject[];
  heartbeat: HeartbeatSettings;
  network: NetworkSettings;
  channels: ChannelSettings[];
  remoteBridge: RemoteBridgeSettings;
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
  petModelBindings: {},
  petDisplayNames: {},
  petScale: 0.5,
  movementEnabled: true,
  movementIntensity: "lively",
  keyboardControlEnabled: false,
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
  activeProjectId: "",
  projects: [],
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
  channels: defaultChannelSettings(),
  remoteBridge: defaultRemoteBridgeSettings(),
  activeConversationId: "default",
  conversations: [
    {
      id: "default",
      title: "新会话",
      mode: "agent",
      messages: [],
      updatedAt: ""
    }
  ]
};

export class SettingsStore {
  private readonly filePath: string;
  private saveQueue: Promise<void> = Promise.resolve();
  private tempCounter = 0;

  constructor(
    private readonly userDataDir: string,
    private readonly safeStorage?: SafeStorageAdapter
  ) {
    this.filePath = join(userDataDir, "settings.json");
  }

  async loadSettings(): Promise<AppSettings> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.defaultSettings();
      }
      throw error;
    }

    try {
      return this.hydrate(JSON.parse(raw) as StoredSettings);
    } catch (error) {
      if (error instanceof SyntaxError) {
        const stored = await this.recoverCorruptSettings(raw);
        return this.hydrate(stored);
      }
      throw error;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const pendingSave = this.saveQueue.then(() => this.writeSettingsFile(settings));
    this.saveQueue = pendingSave.catch(() => undefined);
    return pendingSave;
  }

  private async writeSettingsFile(settings: AppSettings): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true });
    const stored = this.dehydrate(settings);
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${this.tempCounter += 1}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    try {
      await replaceFileWithRetry(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async recoverCorruptSettings(raw: string): Promise<StoredSettings> {
    await this.backupCorruptSettings(raw);
    const repaired = readFirstJsonDocument(raw);
    if (repaired) {
      await writeFile(this.filePath, `${repaired}\n`, "utf8");
      return JSON.parse(repaired) as StoredSettings;
    }

    const defaults = this.defaultSettings();
    await this.saveSettings(defaults);
    return defaults as StoredSettings;
  }

  private async backupCorruptSettings(raw: string): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(`${this.filePath}.corrupt-${stamp}.bak`, raw, "utf8");
  }

  private defaultSettings(): AppSettings {
    return ensureProjects({
      ...DEFAULT_SETTINGS,
      api: { ...DEFAULT_SETTINGS.api },
      models: DEFAULT_SETTINGS.models.map((model) => ({ ...model })),
      activePetIds: [...DEFAULT_SETTINGS.activePetIds],
      petModelBindings: { ...DEFAULT_SETTINGS.petModelBindings },
      petDisplayNames: { ...DEFAULT_SETTINGS.petDisplayNames },
      agent: { ...DEFAULT_SETTINGS.agent },
      activeProjectId: DEFAULT_SETTINGS.activeProjectId,
      projects: DEFAULT_SETTINGS.projects.map((project) => ({ ...project })),
      heartbeat: { ...DEFAULT_SETTINGS.heartbeat, sentGreetingKeys: [] },
      network: { ...DEFAULT_SETTINGS.network, readNoticeIds: [] },
      channels: cloneChannelSettings(DEFAULT_SETTINGS.channels),
      remoteBridge: cloneRemoteBridgeSettings(DEFAULT_SETTINGS.remoteBridge),
      conversations: DEFAULT_SETTINGS.conversations.map((conversation) => ({ ...conversation }))
    });
  }

  private hydrate(stored: StoredSettings): AppSettings {
    let apiKey = stored.api.apiKey ?? "";
    if (stored.api.apiKeyEncrypted && this.safeStorage?.isEncryptionAvailable()) {
      apiKey = this.safeStorage.decryptString(Buffer.from(stored.api.apiKeyEncrypted, "base64"));
    }

    return ensureProjects({
      ...DEFAULT_SETTINGS,
      ...stored,
      activePetIds: stored.activePetIds?.length ? stored.activePetIds.slice(0, 2) : [stored.activePetId || "xiaomi"],
      petModelBindings: stored.petModelBindings ?? {},
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
        updateFeedUrl: stored.network?.updateFeedUrl?.trim() || DEFAULT_SETTINGS.network.updateFeedUrl,
        noticeFeedUrl: stored.network?.noticeFeedUrl?.trim() || DEFAULT_SETTINGS.network.noticeFeedUrl,
        readNoticeIds: stored.network?.readNoticeIds ?? []
      },
      channels: cloneChannelSettings(stored.channels),
      remoteBridge: cloneRemoteBridgeSettings(stored.remoteBridge),
      conversations: stored.conversations?.length
        ? stored.conversations
        : DEFAULT_SETTINGS.conversations.map((conversation) => ({ ...conversation })),
      activeConversationId: stored.activeConversationId || DEFAULT_SETTINGS.activeConversationId
    });
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

function readFirstJsonDocument(raw: string): string | undefined {
  let depth = 0;
  let started = false;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      depth += 1;
      started = true;
      continue;
    }

    if (char === "}" || char === "]") {
      depth -= 1;
      if (started && depth === 0) {
        const candidate = raw.slice(0, index + 1).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

async function replaceFileWithRetry(tempPath: string, targetPath: string): Promise<void> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await rename(tempPath, targetPath);
      return;
    } catch (error) {
      if (!isRetryableReplaceError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await delay(35 * (attempt + 1));
    }
  }
}

function isRetryableReplaceError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
