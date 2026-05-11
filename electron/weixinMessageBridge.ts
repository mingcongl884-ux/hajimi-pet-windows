import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { ChannelMessage } from "../src/lib/channelRouter.js";

const require = createRequire(import.meta.url);
const WEIXIN_PLUGIN_PACKAGE = "@tencent-weixin/openclaw-weixin/package.json";
const WORKER_PREFIX = "__HAJIMI_WEIXIN__";
const DEFAULT_POLL_TIMEOUT_MS = 25_000;

export type WeixinMessageReply = (text: string) => Promise<void>;

export type WeixinMessageBridgeOptions = {
  onMessage(message: ChannelMessage, reply: WeixinMessageReply): Promise<void>;
  onStatus?(status: "starting" | "connected" | "error", message: string): void;
  onLog?(message: string): void;
  pollTimeoutMs?: number;
};

export type WeixinMessageBridgeStop = () => void;

type WorkerEvent =
  | { type: "status"; status: "starting" | "connected" | "error"; message: string }
  | { type: "log"; message: string }
  | { type: "message"; replyId: string; message: ChannelMessage };

export function startWeixinMessageBridge(options: WeixinMessageBridgeOptions): WeixinMessageBridgeStop {
  const controller = new AbortController();
  let child: ChildProcessWithoutNullStreams | undefined;

  void startWorkerProcess(options, controller.signal)
    .then((worker) => {
      child = worker;
      if (controller.signal.aborted) {
        stopWorker(worker);
      }
    })
    .catch((error) => {
      if (controller.signal.aborted) {
        return;
      }
      const message = readErrorMessage(error);
      options.onStatus?.("error", message);
      options.onLog?.(`weixin bridge stopped: ${message}`);
    });

  return () => {
    controller.abort();
    if (child) {
      stopWorker(child);
    }
  };
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

async function startWorkerProcess(
  options: WeixinMessageBridgeOptions,
  signal: AbortSignal
): Promise<ChildProcessWithoutNullStreams> {
  process.env.OPENCLAW_STATE_DIR = bundledOpenClawStateDir();
  const pluginRoot = resolveWeixinPluginRoot();
  if (!pluginRoot) {
    throw new Error("没有找到内置微信 ClawBot 插件。");
  }

  const workerPath = await writeWorkerScript();
  const child = spawn(resolveNodeRuntime(), [workerPath], {
    cwd: pluginRoot,
    env: {
      ...process.env,
      HAJIMI_WEIXIN_PLUGIN_ROOT: pluginRoot,
      HAJIMI_WEIXIN_POLL_TIMEOUT_MS: String(options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS),
      OPENCLAW_STATE_DIR: bundledOpenClawStateDir()
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  signal.addEventListener("abort", () => stopWorker(child), { once: true });
  child.on("error", (error) => {
    const message = readErrorMessage(error);
    options.onStatus?.("error", message);
    options.onLog?.(`weixin bridge process error: ${message}`);
  });
  child.on("exit", (code, exitSignal) => {
    if (signal.aborted) {
      return;
    }
    const message = `微信桥接进程已退出：${exitSignal ?? code ?? "unknown"}`;
    options.onStatus?.("error", message);
    options.onLog?.(`weixin bridge process exited: ${exitSignal ?? code ?? "unknown"}`);
  });

  let stdoutBuffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += String(chunk);
    stdoutBuffer = consumeWorkerLines(stdoutBuffer, (line) => handleWorkerLine(line, child, options));
  });

  let stderrBuffer = "";
  child.stderr.on("data", (chunk) => {
    stderrBuffer += String(chunk);
    stderrBuffer = consumeWorkerLines(stderrBuffer, (line) => {
      if (line.trim()) {
        options.onLog?.(`weixin bridge stderr: ${line.trim()}`);
      }
    });
  });

  return child;
}

function consumeWorkerLines(buffer: string, handleLine: (line: string) => void): string {
  let rest = buffer;
  let newline = rest.indexOf("\n");
  while (newline >= 0) {
    const line = rest.slice(0, newline).replace(/\r$/, "");
    rest = rest.slice(newline + 1);
    handleLine(line);
    newline = rest.indexOf("\n");
  }
  return rest;
}

function handleWorkerLine(
  line: string,
  child: ChildProcessWithoutNullStreams,
  options: WeixinMessageBridgeOptions
) {
  if (!line.trim()) {
    return;
  }
  if (!line.startsWith(WORKER_PREFIX)) {
    options.onLog?.(`weixin bridge: ${line}`);
    return;
  }

  let event: WorkerEvent;
  try {
    event = JSON.parse(line.slice(WORKER_PREFIX.length)) as WorkerEvent;
  } catch (error) {
    options.onLog?.(`weixin bridge parse failed: ${readErrorMessage(error)}`);
    return;
  }

  if (event.type === "status") {
    options.onStatus?.(event.status, event.message);
    return;
  }
  if (event.type === "log") {
    options.onLog?.(event.message);
    return;
  }
  if (event.type === "message") {
    void options.onMessage(event.message, async (text) => {
      if (child.stdin.destroyed || !child.stdin.writable) {
        throw new Error("微信桥接进程不可用。");
      }
      child.stdin.write(JSON.stringify({ type: "reply", replyId: event.replyId, text }) + "\n");
    }).catch((error) => {
      options.onLog?.(`weixin bridge message failed: ${readErrorMessage(error)}`);
    });
  }
}

function stopWorker(child: ChildProcessWithoutNullStreams) {
  try {
    if (!child.stdin.destroyed && child.stdin.writable) {
      child.stdin.write(JSON.stringify({ type: "stop" }) + "\n");
    }
  } catch {
    // Best effort shutdown.
  }
  setTimeout(() => {
    if (!child.killed) {
      child.kill();
    }
  }, 500).unref();
}

async function writeWorkerScript(): Promise<string> {
  const scriptDir = join(app.getPath("userData"), "channel-scripts");
  await mkdir(scriptDir, { recursive: true });
  const workerPath = join(scriptDir, "hajimi-weixin-bridge-worker.mjs");
  await writeFile(workerPath, weixinBridgeWorkerScript(), "utf8");
  return workerPath;
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

function resolveNodeRuntime(): string {
  return resolveBundledNodeRuntime() ?? "node";
}

function resolveBundledNodeRuntime(): string | undefined {
  const nodeRoot = resolveBundledPackageRoot("node/package.json");
  if (nodeRoot) {
    const executableName = process.platform === "win32" ? "node.exe" : "node";
    const candidate = normalizeAsarUnpackedPath(join(nodeRoot, "bin", executableName));
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const packageBin = normalizeAsarUnpackedPath(require.resolve("node/bin/node"));
    const packageBinCandidate = process.platform === "win32" ? `${packageBin}.exe` : packageBin;
    if (existsSync(packageBinCandidate)) {
      return packageBinCandidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveBundledPackageRoot(packageJsonPath: string): string | undefined {
  const parts = packageJsonPath.split("/");
  if (parts.at(-1) !== "package.json") {
    return undefined;
  }

  const packageParts = parts.slice(0, -1);
  const packageJson = findFirstExistingPath(
    resolveBundledNodeModulesRoots().map((root) => join(root, ...packageParts, "package.json"))
  ) ?? resolvePackagePath(packageJsonPath);
  return packageJson ? dirname(packageJson) : undefined;
}

function resolvePackagePath(packagePath: string): string | undefined {
  try {
    return normalizeAsarUnpackedPath(require.resolve(packagePath));
  } catch {
    return undefined;
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

function weixinBridgeWorkerScript(): string {
  return String.raw`import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WORKER_PREFIX = "__HAJIMI_WEIXIN__";
const pluginRoot = process.env.HAJIMI_WEIXIN_PLUGIN_ROOT;
const pollTimeoutMs = Number(process.env.HAJIMI_WEIXIN_POLL_TIMEOUT_MS || "25000");
const retryDelayMs = 3000;
let stopping = false;
let replyCounter = 0;
const pollStates = new Map();
const pendingReplies = new Map();

if (!pluginRoot) {
  throw new Error("Missing HAJIMI_WEIXIN_PLUGIN_ROOT.");
}

function writeEvent(payload) {
  process.stdout.write(WORKER_PREFIX + JSON.stringify(payload) + "\n");
}

function readErrorMessage(error) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
}

function importFile(relativePath) {
  return import(pathToFileURL(join(pluginRoot, relativePath)).href);
}

async function loadModules() {
  const api = await importFile("dist/src/api/api.js");
  const send = await importFile("dist/src/messaging/send.js");
  const inbound = await importFile("dist/src/messaging/inbound.js");
  const accounts = await importFile("dist/src/auth/accounts.js");
  const sync = await importFile("dist/src/storage/sync-buf.js");
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

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  void handleCommand(line);
});
input.on("close", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function handleCommand(line) {
  let command;
  try {
    command = JSON.parse(line);
  } catch {
    return;
  }
  if (command.type === "stop") {
    stopping = true;
    return;
  }
  if (command.type !== "reply") {
    return;
  }

  const reply = pendingReplies.get(command.replyId);
  const text = String(command.text || "").trim();
  if (!reply || !text) {
    return;
  }

  try {
    await modules.sendMessageWeixin({
      to: reply.peerId,
      text,
      opts: {
        baseUrl: reply.baseUrl,
        token: reply.token,
        contextToken: reply.contextToken,
        timeoutMs: 15000
      }
    });
  } catch (error) {
    writeEvent({ type: "log", message: "weixin send reply failed: " + readErrorMessage(error) });
  }
}

const modules = await loadModules();
writeEvent({ type: "status", status: "starting", message: "正在等待微信 ClawBot 登录。" });

while (!stopping) {
  try {
    const accountIds = modules.listWeixinAccountIds({});
    const accounts = accountIds
      .map((accountId) => modules.resolveWeixinAccount({ channels: {} }, accountId))
      .filter((account) => account.configured && account.token && account.token.trim());

    if (accounts.length === 0) {
      writeEvent({ type: "status", status: "starting", message: "还没有检测到微信登录凭据，扫码后会自动接入当前会话。" });
      await sleep(retryDelayMs);
      continue;
    }

    writeEvent({ type: "status", status: "connected", message: "微信通道已接入 " + accounts.length + " 个账号。" });
    for (const account of accounts) {
      if (stopping) {
        break;
      }
      await pollAccount(account);
    }
  } catch (error) {
    if (stopping) {
      break;
    }
    writeEvent({ type: "status", status: "error", message: readErrorMessage(error) });
    writeEvent({ type: "log", message: "weixin bridge poll error: " + readErrorMessage(error) });
    await sleep(retryDelayMs);
  }
}

await notifyBridgeStop();
process.exit(0);

async function pollAccount(account) {
  const token = account.token && account.token.trim();
  if (!token) {
    return;
  }

  const state = getAccountPollState(account.accountId);
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
    throw new Error(response.errmsg || "WeChat getUpdates failed: " + (response.ret ?? response.errcode));
  }
  if (response.get_updates_buf) {
    state.getUpdatesBuf = response.get_updates_buf;
    modules.saveGetUpdatesBuf(modules.getSyncBufFilePath(account.accountId), response.get_updates_buf);
  }

  for (const full of response.msgs || []) {
    if (stopping) {
      break;
    }
    handleWeixinFullMessage(account, token, full);
  }
}

function handleWeixinFullMessage(account, token, full) {
  const peerId = String(full.from_user_id || "").trim();
  if (!peerId) {
    return;
  }
  if (full.context_token) {
    modules.setContextToken(account.accountId, peerId, full.context_token);
  }

  const context = modules.weixinMessageToMsgContext(full, account.accountId);
  const text = String(context.Body || "").trim();
  if (!text) {
    return;
  }

  const time = Number(full.create_time_ms);
  const receivedAt = Number.isFinite(time) && time > 0
    ? new Date(time).toISOString()
    : new Date().toISOString();
  const replyId = String(Date.now()) + "-" + String(replyCounter += 1);
  pendingReplies.set(replyId, {
    peerId,
    baseUrl: account.baseUrl,
    token,
    contextToken: full.context_token
  });
  const cleanupTimer = setTimeout(() => pendingReplies.delete(replyId), 10 * 60 * 1000);
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  writeEvent({
    type: "message",
    replyId,
    message: {
      channel: "wechat",
      peerId,
      peerKind: "direct",
      text,
      attachments: [],
      receivedAt
    }
  });
}

function getAccountPollState(accountId) {
  const existing = pollStates.get(accountId);
  if (existing) {
    return existing;
  }
  const syncFilePath = modules.getSyncBufFilePath(accountId);
  const state = {
    getUpdatesBuf: modules.loadGetUpdatesBuf(syncFilePath) || "",
    nextTimeoutMs: pollTimeoutMs,
    notified: false
  };
  pollStates.set(accountId, state);
  return state;
}

async function notifyBridgeStop() {
  const accountIds = modules.listWeixinAccountIds({});
  for (const accountId of accountIds) {
    try {
      const account = modules.resolveWeixinAccount({ channels: {} }, accountId);
      const state = pollStates.get(account.accountId);
      if (account.configured && account.token && account.token.trim() && state && state.notified) {
        await modules.notifyStop({ baseUrl: account.baseUrl, token: account.token });
      }
    } catch {
      // Best effort shutdown only.
    }
  }
}

async function sleep(ms) {
  await delay(ms).catch(() => undefined);
}
`;
}
