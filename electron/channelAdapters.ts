import { spawn } from "node:child_process";
import { app } from "electron";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ChannelProvider, ChannelSettings } from "../src/lib/channels.js";

const require = createRequire(import.meta.url);

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
      message: "没有检测到 openclaw CLI。请先安装 OpenClaw，并确保 openclaw 在 PATH 中。",
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
  const child = spawn("powershell.exe", ["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", titledCommand], {
    detached: true,
    windowsHide: false,
    stdio: "ignore"
  });
  child.unref();
}

function buildWeixinInstallerCommand(channel: ChannelSettings): string {
  const fallback = channel.wechat?.pluginCommand.trim()
    || "npx -y @tencent-weixin/openclaw-weixin-cli@latest install";
  const cliPath = resolveBundledWeixinInstaller();
  const nodeRuntime = resolveNodeRuntime();
  if (!cliPath) {
    return fallback;
  }

  return [
    `& ${quotePowerShellString(nodeRuntime)} ${quotePowerShellString(cliPath)} install`,
    `if ($LASTEXITCODE -ne 0) {`,
    `  Write-Host '内置微信 ClawBot 安装器未完成，改用在线 npx 安装...'`,
    `  ${fallback}`,
    `}`
  ].join("; ");
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
  try {
    return normalizeAsarUnpackedPath(require.resolve("openclaw/openclaw.mjs"));
  } catch {
    return undefined;
  }
}

function resolveBundledWeixinInstaller(): string | undefined {
  try {
    return normalizeAsarUnpackedPath(require.resolve("@tencent-weixin/openclaw-weixin-cli/cli.mjs"));
  } catch {
    return undefined;
  }
}

function resolveNodeRuntime(): string {
  return resolveBundledNodeRuntime() ?? "node";
}

function resolveBundledNodeRuntime(): string | undefined {
  try {
    const nodeRoot = dirname(require.resolve("node/package.json"));
    const executableName = process.platform === "win32" ? "node.exe" : "node";
    const candidate = normalizeAsarUnpackedPath(join(nodeRoot, "bin", executableName));
    if (existsSync(candidate)) {
      return candidate;
    }

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

function normalizeAsarUnpackedPath(value: string): string {
  return value.replace(/\.asar([\\/])/, ".asar.unpacked$1");
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runOpenClaw(args: string[], timeoutMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const bundledCli = resolveBundledOpenClawCli();
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
      resolve({ code: null, output: `${output}\nCommand timed out.`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: null, output: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output: output.trim() });
    });
  });
}

function bundledOpenClawStateDir(): string {
  return join(app.getPath("userData"), "openclaw-state");
}
