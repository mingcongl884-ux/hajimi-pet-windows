import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import type { ChannelMessage } from "../src/lib/channelRouter.js";

const require = createRequire(import.meta.url);
const WEIXIN_PLUGIN_PACKAGE = "@tencent-weixin/openclaw-weixin/package.json";
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 3_000;

type WeixinAccount = {
  accountId: string;
  baseUrl: string;
  token?: string;
  configured: boolean;
};

type WeixinFullMessage = {
  from_user_id?: string;
  context_token?: string;
  create_time_ms?: number;
  item_list?: unknown[];
};

type WeixinBridgeModules = {
  getUpdates(params: {
    baseUrl: string;
    token: string;
    get_updates_buf?: string;
    timeoutMs?: number;
  }): Promise<{
    ret?: number;
    errcode?: number;
    errmsg?: string;
    msgs?: WeixinFullMessage[];
    get_updates_buf?: string;
    longpolling_timeout_ms?: number;
  }>;
  sendMessageWeixin(params: {
    to: string;
    text: string;
    opts: {
      baseUrl: string;
      token: string;
      contextToken?: string;
      timeoutMs?: number;
    };
  }): Promise<unknown>;
  listWeixinAccountIds(cfg: unknown): string[];
  resolveWeixinAccount(cfg: unknown, accountId: string): WeixinAccount;
  getSyncBufFilePath(accountId: string): string;
  loadGetUpdatesBuf(filePath: string): string | undefined;
  saveGetUpdatesBuf(filePath: string, getUpdatesBuf: string): void;
  setContextToken(accountId: string, userId: string, token: string): void;
  weixinMessageToMsgContext(msg: WeixinFullMessage, accountId: string): { Body?: string; From?: string };
  notifyStart(params: { baseUrl: string; token: string }): Promise<unknown>;
  notifyStop(params: { baseUrl: string; token: string }): Promise<unknown>;
};

export type WeixinMessageReply = (text: string) => Promise<void>;

export type WeixinMessageBridgeOptions = {
  onMessage(message: ChannelMessage, reply: WeixinMessageReply): Promise<void>;
  onStatus?(status: "starting" | "connected" | "error", message: string): void;
  onLog?(message: string): void;
  pollTimeoutMs?: number;
};

export type WeixinMessageBridgeStop = () => void;

type AccountPollState = {
  getUpdatesBuf: string;
  nextTimeoutMs: number;
  notified: boolean;
};

export function startWeixinMessageBridge(options: WeixinMessageBridgeOptions): WeixinMessageBridgeStop {
  const controller = new AbortController();
  void runWeixinBridgeLoop(options, controller.signal).catch((error) => {
    options.onStatus?.("error", readErrorMessage(error));
    options.onLog?.(`weixin bridge stopped: ${readErrorMessage(error)}`);
  });
  return () => controller.abort();
}

export function hasBundledWeixinAccount(): boolean {
  const indexPath = join(bundledOpenClawStateDir(), "openclaw-weixin", "accounts.json");
  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8"));
    return Array.isArray(parsed) && parsed.some((item) => typeof item === "string" && item.trim());
  } catch {
    return false;
  }
}

async function runWeixinBridgeLoop(options: WeixinMessageBridgeOptions, signal: AbortSignal) {
  process.env.OPENCLAW_STATE_DIR = bundledOpenClawStateDir();
  const modules = await loadWeixinModules();
  const pollStates = new Map<string, AccountPollState>();
  options.onStatus?.("starting", "正在等待微信 ClawBot 登录。");

  while (!signal.aborted) {
    try {
      const accountIds = modules.listWeixinAccountIds({});
      const accounts = accountIds
        .map((accountId) => modules.resolveWeixinAccount({ channels: {} }, accountId))
        .filter((account) => account.configured && account.token?.trim());

      if (accounts.length === 0) {
        options.onStatus?.("starting", "还没有检测到微信登录凭据，扫码后会自动接入当前会话。");
        await sleep(RETRY_DELAY_MS, signal);
        continue;
      }

      options.onStatus?.("connected", `微信通道已接入 ${accounts.length} 个账号。`);
      for (const account of accounts) {
        if (signal.aborted) {
          break;
        }
        await pollAccount(modules, account, pollStates, options, signal);
      }
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      options.onStatus?.("error", readErrorMessage(error));
      options.onLog?.(`weixin bridge poll error: ${readErrorMessage(error)}`);
      await sleep(RETRY_DELAY_MS, signal);
    }
  }

  await notifyBridgeStop(modules, pollStates);
}

async function pollAccount(
  modules: WeixinBridgeModules,
  account: WeixinAccount,
  pollStates: Map<string, AccountPollState>,
  options: WeixinMessageBridgeOptions,
  signal: AbortSignal
) {
  const token = account.token?.trim();
  if (!token) {
    return;
  }

  const state = getAccountPollState(modules, pollStates, account.accountId, options.pollTimeoutMs);
  if (!state.notified) {
    state.notified = true;
    await modules.notifyStart({ baseUrl: account.baseUrl, token }).catch(() => undefined);
  }

  const response = await modules.getUpdates({
    baseUrl: account.baseUrl,
    token,
    get_updates_buf: state.getUpdatesBuf,
    timeoutMs: state.nextTimeoutMs
  });

  if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
    state.nextTimeoutMs = response.longpolling_timeout_ms;
  }
  if ((response.ret ?? 0) !== 0 || (response.errcode ?? 0) !== 0) {
    throw new Error(response.errmsg || `WeChat getUpdates failed: ${response.ret ?? response.errcode}`);
  }
  if (response.get_updates_buf) {
    state.getUpdatesBuf = response.get_updates_buf;
    modules.saveGetUpdatesBuf(modules.getSyncBufFilePath(account.accountId), response.get_updates_buf);
  }

  for (const full of response.msgs ?? []) {
    if (signal.aborted) {
      break;
    }
    await handleWeixinFullMessage(modules, account, token, full, options);
  }
}

async function handleWeixinFullMessage(
  modules: WeixinBridgeModules,
  account: WeixinAccount,
  token: string,
  full: WeixinFullMessage,
  options: WeixinMessageBridgeOptions
) {
  const peerId = full.from_user_id?.trim();
  if (!peerId) {
    return;
  }
  if (full.context_token) {
    modules.setContextToken(account.accountId, peerId, full.context_token);
  }
  const context = modules.weixinMessageToMsgContext(full, account.accountId);
  const text = context.Body?.trim();
  if (!text) {
    return;
  }

  const receivedAt = full.create_time_ms && Number.isFinite(full.create_time_ms)
    ? new Date(full.create_time_ms).toISOString()
    : new Date().toISOString();

  await options.onMessage(
    {
      channel: "wechat",
      peerId,
      peerKind: "direct",
      text,
      attachments: [],
      receivedAt
    },
    async (replyText) => {
      const trimmed = replyText.trim();
      if (!trimmed) {
        return;
      }
      await modules.sendMessageWeixin({
        to: peerId,
        text: trimmed,
        opts: {
          baseUrl: account.baseUrl,
          token,
          contextToken: full.context_token,
          timeoutMs: 15_000
        }
      });
    }
  );
}

function getAccountPollState(
  modules: WeixinBridgeModules,
  pollStates: Map<string, AccountPollState>,
  accountId: string,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
): AccountPollState {
  const existing = pollStates.get(accountId);
  if (existing) {
    return existing;
  }
  const syncFilePath = modules.getSyncBufFilePath(accountId);
  const state = {
    getUpdatesBuf: modules.loadGetUpdatesBuf(syncFilePath) ?? "",
    nextTimeoutMs: pollTimeoutMs,
    notified: false
  };
  pollStates.set(accountId, state);
  return state;
}

async function loadWeixinModules(): Promise<WeixinBridgeModules> {
  const pluginRoot = resolveWeixinPluginRoot();
  if (!pluginRoot) {
    throw new Error("没有找到内置微信 ClawBot 插件。");
  }

  const api = await importFile(join(pluginRoot, "dist", "src", "api", "api.js"));
  const send = await importFile(join(pluginRoot, "dist", "src", "messaging", "send.js"));
  const inbound = await importFile(join(pluginRoot, "dist", "src", "messaging", "inbound.js"));
  const accounts = await importFile(join(pluginRoot, "dist", "src", "auth", "accounts.js"));
  const sync = await importFile(join(pluginRoot, "dist", "src", "storage", "sync-buf.js"));

  return {
    getUpdates: api.getUpdates,
    sendMessageWeixin: send.sendMessageWeixin,
    listWeixinAccountIds: accounts.listWeixinAccountIds,
    resolveWeixinAccount: accounts.resolveWeixinAccount,
    getSyncBufFilePath: sync.getSyncBufFilePath,
    loadGetUpdatesBuf: sync.loadGetUpdatesBuf,
    saveGetUpdatesBuf: sync.saveGetUpdatesBuf,
    setContextToken: inbound.setContextToken,
    weixinMessageToMsgContext: inbound.weixinMessageToMsgContext,
    notifyStart: api.notifyStart,
    notifyStop: api.notifyStop
  };
}

function resolveWeixinPluginRoot(): string | undefined {
  const installedPlugin = join(bundledOpenClawStateDir(), "extensions", "openclaw-weixin");
  if (existsSync(join(installedPlugin, "dist", "src", "api", "api.js"))) {
    return installedPlugin;
  }

  const bundledPackage = findFirstExistingPath(
    resolveBundledNodeModulesRoots().map((root) => join(root, "@tencent-weixin", "openclaw-weixin", "package.json"))
  );
  if (bundledPackage) {
    return dirname(bundledPackage);
  }

  try {
    return dirname(normalizeAsarUnpackedPath(require.resolve(WEIXIN_PLUGIN_PACKAGE)));
  } catch {
    return undefined;
  }
}

async function importFile(filePath: string): Promise<Record<string, any>> {
  return import(pathToFileURL(normalizeAsarUnpackedPath(filePath)).href);
}

async function sleep(ms: number, signal: AbortSignal) {
  await delay(ms, undefined, { signal }).catch(() => undefined);
}

async function notifyBridgeStop(modules: WeixinBridgeModules, pollStates: Map<string, AccountPollState>) {
  const accountIds = modules.listWeixinAccountIds({});
  for (const accountId of accountIds) {
    try {
      const account = modules.resolveWeixinAccount({ channels: {} }, accountId);
      if (account.configured && account.token?.trim() && pollStates.get(account.accountId)?.notified) {
        await modules.notifyStop({ baseUrl: account.baseUrl, token: account.token });
      }
    } catch {
      // Best effort shutdown only.
    }
  }
}

function resolveBundledNodeModulesRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    roots.push(join(resourcesPath, "app.asar.unpacked", "node_modules"));
  }
  const appPath = app.getAppPath();
  roots.push(join(normalizeAsarUnpackedPath(appPath), "node_modules"));
  roots.push(join(appPath, "node_modules"));
  roots.push(join(process.cwd(), "node_modules"));
  return [...new Set(roots)];
}

function findFirstExistingPath(paths: string[]): string | undefined {
  return paths.find((candidate) => existsSync(candidate));
}

function bundledOpenClawStateDir(): string {
  return join(app.getPath("userData"), "openclaw-state");
}

function normalizeAsarUnpackedPath(value: string): string {
  return value.replace(/\.asar(?=([\\/]|$))/, ".asar.unpacked");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
