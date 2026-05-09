import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, GITHUB_NOTICE_FEED_URL, GITHUB_UPDATE_FEED_URL, SettingsStore } from "../electron/settingsStore";

describe("SettingsStore", () => {
  it("encrypts API keys when safe storage is available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
      decryptString: (value: Buffer) => value.toString("utf8").replace("encrypted:", "")
    };
    const store = new SettingsStore(dir, safeStorage);

    await store.saveSettings({
      ...DEFAULT_SETTINGS,
      activePetId: "xiaomi",
      activePetIds: ["xiaomi"],
      petDisplayNames: {},
      petScale: 1,
      movementEnabled: true,
      movementIntensity: "normal",
      playTogetherEnabled: true,
      agent: {
        workspaceDir: "C:\\work\\xiaomi",
        allowCommands: true,
        permissionMode: "auto-review"
      },
      models: [
        {
          id: "default",
          name: "默认模型",
          provider: "openai-compatible",
          baseUrl: "https://api.example.com",
          apiKey: "secret",
          model: "gpt-4.1-mini",
          systemPrompt: "Be kind."
        }
      ],
      activeChatModelId: "default",
      activeAgentModelId: "default",
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
      conversations: [
        {
          id: "default",
          title: "新会话",
          mode: "chat",
          messages: [],
          updatedAt: "2026-05-08T10:00:00.000Z"
        }
      ],
      api: {
        baseUrl: "https://api.example.com",
        apiKey: "secret",
        model: "gpt-4.1-mini",
        systemPrompt: "Be kind."
      }
    });

    expect((await store.loadSettings()).api.apiKey).toBe("secret");
    expect(await readFile(join(dir, "settings.json"), "utf8")).not.toContain("secret");
  });

  it("returns defaults when settings have not been saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    const store = new SettingsStore(dir);

    await expect(store.loadSettings()).resolves.toMatchObject({
      activePetId: "xiaomi",
      petScale: 0.5,
      movementEnabled: true,
      movementIntensity: "lively",
      playTogetherEnabled: true,
      agent: {
        permissionMode: "default"
      },
      network: {
        updateFeedUrl: "https://github.com/mingcongl884-ux/hajimi-pet-windows/releases/latest/download",
        noticeFeedUrl: "https://raw.githubusercontent.com/mingcongl884-ux/hajimi-pet-windows/main/notices.json"
      }
    });
  });

  it("migrates legacy command toggles to the closest permission mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, "settings.json"), JSON.stringify({
      api: {
        baseUrl: "https://api.example.com",
        apiKey: "",
        model: "gpt-4.1-mini",
        systemPrompt: "Be kind."
      },
      agent: {
        workspaceDir: "C:\\work\\xiaomi",
        allowCommands: true
      }
    }), "utf8")));
    const store = new SettingsStore(dir);

    await expect(store.loadSettings()).resolves.toMatchObject({
      agent: {
        workspaceDir: "C:\\work\\xiaomi",
        permissionMode: "auto-review"
      }
    });
  });

  it("fills default update feeds when older settings stored empty strings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    await writeFile(join(dir, "settings.json"), JSON.stringify({
      ...DEFAULT_SETTINGS,
      network: {
        ...DEFAULT_SETTINGS.network,
        updateFeedUrl: "",
        noticeFeedUrl: ""
      }
    }), "utf8");
    const store = new SettingsStore(dir);

    const loaded = await store.loadSettings();

    expect(loaded.network.updateFeedUrl).toBe(GITHUB_UPDATE_FEED_URL);
    expect(loaded.network.noticeFeedUrl).toBe(GITHUB_NOTICE_FEED_URL);
  });

  it("repairs a settings file with trailing JSON garbage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    const settingsPath = join(dir, "settings.json");
    await writeFile(settingsPath, `${JSON.stringify({
      ...DEFAULT_SETTINGS,
      petScale: 0.42,
      api: {
        ...DEFAULT_SETTINGS.api,
        apiKey: "keep-me"
      }
    }, null, 2)}\n}\n`, "utf8");
    const store = new SettingsStore(dir);

    const loaded = await store.loadSettings();

    expect(loaded.petScale).toBe(0.42);
    expect(loaded.api.apiKey).toBe("keep-me");
    expect(JSON.parse(await readFile(settingsPath, "utf8")).petScale).toBe(0.42);
    expect((await readdir(dir)).some((name) => name.includes(".corrupt-"))).toBe(true);
  });

  it("falls back to defaults when a corrupted settings file cannot be repaired", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pet-settings-"));
    await writeFile(join(dir, "settings.json"), "{ broken", "utf8");
    const store = new SettingsStore(dir);

    const loaded = await store.loadSettings();

    expect(loaded.activePetId).toBe("xiaomi");
    expect(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).activePetId).toBe("xiaomi");
    expect((await readdir(dir)).some((name) => name.includes(".corrupt-"))).toBe(true);
  });
});
