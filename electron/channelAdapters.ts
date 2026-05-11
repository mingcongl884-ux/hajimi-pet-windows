import { spawn } from "node:child_process";
import { app } from "electron";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ChannelProvider, ChannelSettings } from "../src/lib/channels.js";

const require = createRequire(import.meta.url);
const WEIXIN_PLUGIN_PACKAGE = "@tencent-weixin/openclaw-weixin/package.json";
const QRCODE_TERMINAL_PACKAGE = "qrcode-terminal/package.json";
const ZOD_PACKAGE = "zod/package.json";

export type ChannelAdapterResult = {
  provider: ChannelProvider;
  status: "disabled" | "starting" | "connected" | "error";
  message: string;
  output?: string;
};

export async function startChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  const { provider } = channel;
  if (provider === "feishu") {
    if (!channel.feishu?.appId.trim() || !channel.feishu.appSecret.trim()) {
      return { provider, status: "error", message: "请先填写飞书 App ID 和 App Secret。" };
    }
    await launchVisiblePowerShell("openclaw channels add; openclaw gateway status", "哈基Mi 飞书通道");
    return {
      provider,
      status: "starting",
      message: "已打开飞书通道配置终端。完成 openclaw channels add 后，在飞书开放平台启用 WebSocket 长连接并添加 im.message.receive_v1。"
    };
  }

  if (provider === "wechat") {
    const command = buildWeixinInstallerCommand(channel);
    await launchVisiblePowerShell(command, "哈基Mi 微信ClawBot");
    return {
      provider,
      status: "starting",
      message: "已打开微信 ClawBot 内置安装/扫码终端。用微信扫描终端二维码并确认授权后，再点“测试通道”检查状态。"
    };
  }

  return { provider, status: "error", message: "未知通道。" };
}

export async function stopChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  if (channel.provider === "wechat") {
    await runOpenClaw(["config", "set", "plugins.entries.openclaw-weixin.enabled", "false"], 30_000);
    await runOpenClaw(["gateway", "restart"], 30_000);
  }
  return { provider: channel.provider, status: "disabled", message: `${channel.displayName} 已停止。` };
}

export async function testChannelAdapter(channel: ChannelSettings): Promise<ChannelAdapterResult> {
  const version = await runOpenClaw(["--version"], 20_000);
  if (version.code !== 0) {
    return {
      provider: channel.provider,
      status: "error",
      message: version.usedBundled
        ? "已找到内置 OpenClaw，但启动失败。请重新打开哈基Mi后再试，或查看输出。"
        : "没有检测到内置或系统 OpenClaw。请重新安装哈基Mi，或确认 openclaw 在 PATH 中。",
      output: version.output
    };
  }

  const status = await runOpenClaw(["channels", "status", "--probe"], 45_000);
  const needle = channel.provider === "wechat" ? "openclaw-weixin" : "feishu";
  const connected = status.code === 0 && status.output.toLowerCase().includes(needle);
  return {
    provider: channel.provider,
    status: connected ? "connected" : "starting",
    message: connected ? `${channel.displayName} 通道已被 OpenClaw 识别。` : `${channel.displayName} 通道还未完成连接。`,
    output: [version.output, status.output].filter(Boolean).join("\n")
  };
}

async function launchVisiblePowerShell(command: string, title: string) {
  const envSetup = await buildOpenClawShellEnvironment();
  const titledCommand = `$Host.UI.RawUI.WindowTitle = ${quotePowerShellString(title)}; ${envSetup}; ${command}`;
  const encodedCommand = Buffer.from(titledCommand, "utf16le").toString("base64");
  const child = spawn("cmd.exe", [
    "/d",
    "/s",
    "/c",
    "start",
    "",
    "powershell.exe",
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedCommand
  ], {
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();
}

function buildWeixinInstallerCommand(channel: ChannelSettings): string {
  const fallback = channel.wechat?.pluginCommand.trim()
    || "npx -y @tencent-weixin/openclaw-weixin-cli@latest install";
  const pluginRoot = resolveBundledPackageRoot(WEIXIN_PLUGIN_PACKAGE);
  const qrcodeRoot = resolveBundledPackageRoot(QRCODE_TERMINAL_PACKAGE);
  const zodRoot = resolveBundledPackageRoot(ZOD_PACKAGE);
  const openClawRoot = resolveBundledOpenClawPackageRoot();
  if (!pluginRoot || !qrcodeRoot || !zodRoot || !openClawRoot) {
    return fallback;
  }

  return [
    `$ErrorActionPreference = 'Stop'`,
    `function Remove-PathSafely([string]$Path) { if (Test-Path -LiteralPath $Path) { $item = Get-Item -LiteralPath $Path -Force; if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Remove-Item -LiteralPath $Path -Force } else { Remove-Item -LiteralPath $Path -Recurse -Force } } }`,
    `Write-Host '正在准备内置微信 ClawBot 插件...'`,
    `New-Item -ItemType Directory -Force -Path $env:OPENCLAW_STATE_DIR | Out-Null`,
    `$extensionsDir = Join-Path $env:OPENCLAW_STATE_DIR 'extensions'`,
    `$pluginTarget = Join-Path $extensionsDir 'openclaw-weixin'`,
    `$depsTarget = Join-Path $pluginTarget 'node_modules'`,
    `New-Item -ItemType Directory -Force -Path $extensionsDir | Out-Null`,
    `Remove-PathSafely (Join-Path $pluginTarget 'node_modules\\openclaw')`,
    `Remove-PathSafely $pluginTarget`,
    `Copy-Item -LiteralPath ${quotePowerShellString(pluginRoot)} -Destination $extensionsDir -Recurse -Force`,
    `New-Item -ItemType Directory -Force -Path $depsTarget | Out-Null`,
    `Remove-PathSafely (Join-Path $depsTarget 'qrcode-terminal')`,
    `Copy-Item -LiteralPath ${quotePowerShellString(qrcodeRoot)} -Destination $depsTarget -Recurse -Force`,
    `Remove-PathSafely (Join-Path $depsTarget 'zod')`,
    `Copy-Item -LiteralPath ${quotePowerShellString(zodRoot)} -Destination $depsTarget -Recurse -Force`,
    `$openClawPeer = Join-Path $depsTarget 'openclaw'`,
    `Remove-PathSafely $openClawPeer`,
    `try {`,
    `  New-Item -ItemType Junction -Path $openClawPeer -Target ${quotePowerShellString(openClawRoot)} -Force | Out-Null`,
    `} catch {`,
    `  Copy-Item -LiteralPath ${quotePowerShellString(openClawRoot)} -Destination $openClawPeer -Recurse -Force`,
    `}`,
    `$loginScript = Join-Path $pluginTarget 'hajimi-weixin-login.mjs'`,
    `Set-Content -LiteralPath $loginScript -Encoding UTF8 -Value ${quotePowerShellString(weixinDirectLoginScript())}`,
    `openclaw plugins registry --refresh`,
    `if ($LASTEXITCODE -ne 0) { Write-Host '插件索引刷新失败，继续尝试启用微信插件...' }`,
    `openclaw plugins enable openclaw-weixin`,
    `if ($LASTEXITCODE -ne 0) { throw '微信 ClawBot 插件启用失败。' }`,
    `Write-Host '正在生成微信二维码...'`,
    `Write-Host 'Generating WeChat QR code...'`,
    `& ${quotePowerShellString(resolveNodeRuntime())} $loginScript`,
    `if ($LASTEXITCODE -eq 0) {`,
    `  Write-Host '扫码流程结束，正在重启 OpenClaw Gateway...'`,
    `  openclaw gateway restart`,
    `} else {`,
    `  Write-Host '扫码登录命令已退出。若上方已经出现二维码，请用微信扫码并确认授权。'`,
    `}`
  ].join("; ");
}

function weixinDirectLoginScript(): string {
  return String.raw`import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { startWeixinLoginWithQr, displayQRCode, waitForWeixinLogin, DEFAULT_ILINK_BOT_TYPE } from "./dist/src/auth/login-qr.js";
import { saveWeixinAccount, registerWeixinAccountId, clearStaleAccountsForUserId, triggerWeixinChannelReload, DEFAULT_BASE_URL } from "./dist/src/auth/accounts.js";
import { clearContextTokensForAccount } from "./dist/src/messaging/inbound.js";

const accountId = normalizeAccountId(process.env.HAJIMI_WEIXIN_ACCOUNT_ID || "default");

function write(message) {
  process.stdout.write(String(message) + "\n");
}

const startResult = await startWeixinLoginWithQr({
  accountId,
  apiBaseUrl: DEFAULT_BASE_URL,
  botType: DEFAULT_ILINK_BOT_TYPE,
  verbose: true,
  force: true
});

if (!startResult.qrcodeUrl) {
  throw new Error(startResult.message || "Failed to generate WeChat QR code.");
}

write("");
write("Scan this QR code with WeChat, then confirm authorization on your phone.");
write("");
await displayQRCode(startResult.qrcodeUrl);
write("");
write("Waiting for WeChat authorization...");

const waitResult = await waitForWeixinLogin({
  sessionKey: startResult.sessionKey,
  apiBaseUrl: DEFAULT_BASE_URL,
  timeoutMs: 480000,
  verbose: true,
  botType: DEFAULT_ILINK_BOT_TYPE
});

if (waitResult.connected && waitResult.botToken && waitResult.accountId) {
  const normalizedId = normalizeAccountId(waitResult.accountId);
  saveWeixinAccount(normalizedId, {
    token: waitResult.botToken,
    baseUrl: waitResult.baseUrl,
    userId: waitResult.userId
  });
  registerWeixinAccountId(normalizedId);
  if (waitResult.userId) {
    clearStaleAccountsForUserId(normalizedId, waitResult.userId, clearContextTokensForAccount);
  }
  await triggerWeixinChannelReload();
  write("");
  write("WeChat ClawBot connected.");
  process.exit(0);
}

if (waitResult.alreadyConnected) {
  write("");
  write("This WeChat ClawBot is already connected.");
  process.exit(0);
}

throw new Error(waitResult.message || "WeChat authorization did not complete.");
`;
}

async function buildOpenClawShellEnvironment(): Promise<string> {
  const shimDir = await ensureBundledOpenClawShim();
  const stateDir = bundledOpenClawStateDir();
  return [
    `$env:OPENCLAW_STATE_DIR = ${quotePowerShellString(stateDir)}`,
    `$env:PATH = ${quotePowerShellString(`${shimDir};`)} + $env:PATH`
  ].join("; ");
}

async function ensureBundledOpenClawShim(): Promise<string> {
  const shimDir = join(app.getPath("userData"), "openclaw-runtime");
  await mkdir(shimDir, { recursive: true });
  const openClawPath = resolveBundledOpenClawCli();
  if (!openClawPath) {
    return shimDir;
  }

  const nodeRuntime = resolveNodeRuntime();
  const shim = [
    "@echo off",
    "setlocal",
    `"${nodeRuntime}" "${openClawPath}" %*`,
    "endlocal"
  ].join("\r\n");
  await writeFile(join(shimDir, "openclaw.cmd"), shim, "utf8");
  return shimDir;
}

function resolveBundledOpenClawCli(): string | undefined {
  return findFirstExistingPath(
    resolveBundledNodeModulesRoots().map((root) => join(root, "openclaw", "openclaw.mjs"))
  ) ?? resolvePackagePath("openclaw/openclaw.mjs");
}

function resolveBundledPackageRoot(packageJsonPath: string): string | undefined {
  return resolveBundledPackageRootFromNodeModules(packageJsonPath) ?? resolvePackageRoot(packageJsonPath);
}

function resolveBundledPackageRootFromNodeModules(packageJsonPath: string): string | undefined {
  const parts = packageJsonPath.split("/");
  if (parts.at(-1) !== "package.json") {
    return undefined;
  }

  const packageParts = parts.slice(0, -1);
  const packageJson = findFirstExistingPath(
    resolveBundledNodeModulesRoots().map((root) => join(root, ...packageParts, "package.json"))
  );
  return packageJson ? dirname(packageJson) : undefined;
}

function resolvePackageRoot(packageJsonPath: string): string | undefined {
  const packageJson = resolvePackagePath(packageJsonPath);
  return packageJson ? dirname(packageJson) : undefined;
}

function resolvePackagePath(packagePath: string): string | undefined {
  try {
    return normalizeAsarUnpackedPath(require.resolve(packagePath));
  } catch {
    return undefined;
  }
}

function resolveBundledOpenClawPackageRoot(): string | undefined {
  const packageRoot = resolveBundledPackageRoot("openclaw/package.json");
  const cliPath = resolveBundledOpenClawCli();
  return packageRoot ?? (cliPath ? dirname(cliPath) : undefined);
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

function resolveBundledNodeModulesRoots(): string[] {
  const roots: string[] = [];
  // process.resourcesPath points to the packaged Electron resources directory.
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

function normalizeAsarUnpackedPath(value: string): string {
  return value.replace(/\.asar(?=([\\/]|$))/, ".asar.unpacked");
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runOpenClaw(args: string[], timeoutMs: number): Promise<{ code: number | null; output: string; usedBundled: boolean }> {
  return new Promise((resolve) => {
    const bundledCli = resolveBundledOpenClawCli();
    const usedBundled = Boolean(bundledCli);
    const child = spawn(bundledCli ? resolveNodeRuntime() : "openclaw", bundledCli ? [bundledCli, ...args] : args, {
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: bundledOpenClawStateDir()
      },
      windowsHide: true
    });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ code: null, output: `${output}\nCommand timed out.`.trim(), usedBundled });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: null, output: error.message, usedBundled });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output: output.trim(), usedBundled });
    });
  });
}

function bundledOpenClawStateDir(): string {
  return join(app.getPath("userData"), "openclaw-state");
}
