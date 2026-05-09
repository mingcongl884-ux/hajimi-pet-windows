import { spawn } from "node:child_process";
import type { ChannelProvider, ChannelSettings } from "../src/lib/channels.js";

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
    launchVisiblePowerShell("openclaw channels add; openclaw gateway status", "哈基Mi 飞书通道");
    return {
      provider,
      status: "starting",
      message: "已打开飞书通道配置终端。完成 openclaw channels add 后，在飞书开放平台启用 WebSocket 长连接并添加 im.message.receive_v1。"
    };
  }

  if (provider === "wechat") {
    const command = channel.wechat?.pluginCommand.trim()
      || "npx -y @tencent-weixin/openclaw-weixin-cli@latest install";
    launchVisiblePowerShell(command, "哈基Mi 微信ClawBot");
    return {
      provider,
      status: "starting",
      message: "已打开微信 ClawBot 安装/扫码终端。用微信扫描终端二维码并确认授权后，再点“测试通道”检查状态。"
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

function launchVisiblePowerShell(command: string, title: string) {
  const escaped = command.replace(/"/g, '\\"');
  const child = spawn("cmd.exe", ["/c", "start", `"${title}"`, "powershell.exe", "-NoExit", "-NoProfile", "-Command", escaped], {
    detached: true,
    windowsHide: false,
    stdio: "ignore"
  });
  child.unref();
}

function runOpenClaw(args: string[], timeoutMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("openclaw", args, { windowsHide: true });
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
