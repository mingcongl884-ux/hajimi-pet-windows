import { constants } from "node:fs";
import { access, open, rm } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityCheckResult, CapabilityRow } from "../src/lib/capabilityCheck.js";
import { resolveClaudeCodeExecutable } from "./claudeAgentClient.js";
import { resolveBundledOpenClawCli } from "./openClawAgentClient.js";
import type { AppSettings } from "./settingsStore.js";

export async function checkCapabilities(settings: AppSettings): Promise<CapabilityCheckResult> {
  const rows = await Promise.all([
    checkModel(settings),
    checkWorkspace(settings),
    checkOrdinaryOffice(),
    checkClaudeCode(),
    checkOpenClaw(),
    checkWechat(settings)
  ]);
  return {
    checkedAt: new Date().toISOString(),
    rows
  };
}

function checkModel(settings: AppSettings): CapabilityRow {
  const model = settings.models.find((item) => item.id === settings.activeAgentModelId) ?? settings.models[0];
  if (!model) {
    return {
      id: "model",
      label: "模型",
      status: "blocked",
      message: "还没有配置办公模型。",
      fix: "在模型页添加一个 OpenAI 兼容或 Claude Agent SDK 模型。"
    };
  }
  if (!model.apiKey.trim() || !model.baseUrl.trim() || !model.model.trim()) {
    return {
      id: "model",
      label: "模型",
      status: "warning",
      message: "当前模型配置不完整。",
      fix: "补全 API Base URL、API Key 和模型名后点击测试连接。"
    };
  }
  return {
    id: "model",
    label: "模型",
    status: "ready",
    message: `${model.name} 已配置。`
  };
}

async function checkWorkspace(settings: AppSettings): Promise<CapabilityRow> {
  const workspace = settings.agent.workspaceDir.trim();
  if (!workspace) {
    return {
      id: "workspace",
      label: "项目读写",
      status: "blocked",
      message: "还没有选择办公区项目。",
      fix: "在左侧项目区选择一个目录。"
    };
  }

  try {
    await access(workspace, constants.R_OK | constants.W_OK);
    const probePath = join(workspace, `.hajimi-capability-check-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    const probeHandle = await open(probePath, "wx");
    try {
      await probeHandle.writeFile("ok", "utf8");
    } finally {
      await probeHandle.close();
      await rm(probePath, { force: true });
    }
    return {
      id: "workspace",
      label: "项目读写",
      status: "ready",
      message: "当前项目目录可以读写。"
    };
  } catch {
    return {
      id: "workspace",
      label: "项目读写",
      status: "blocked",
      message: "当前项目目录无法读写。",
      fix: "换一个有权限的目录，或检查目录是否仍然存在。"
    };
  }
}

function checkOrdinaryOffice(): CapabilityRow {
  return {
    id: "ordinary-office",
    label: "普通办公",
    status: "ready",
    message: "内置办公工具和 OpenClaw 回退链路可用。"
  };
}

function checkClaudeCode(): CapabilityRow {
  const executable = resolveClaudeCodeExecutable();
  if (!executable) {
    return {
      id: "claude-code",
      label: "Claude Code",
      status: "warning",
      message: "没有检测到 Claude Code 可执行文件。",
      fix: "安装 Claude Code 或通过 CC Switch 配好 Claude 命令后再使用高级办公。"
    };
  }
  return {
    id: "claude-code",
    label: "Claude Code",
    status: "ready",
    message: "已检测到 Claude Code。"
  };
}

function checkOpenClaw(): CapabilityRow {
  const cli = resolveBundledOpenClawCli();
  if (!cli) {
    return {
      id: "openclaw",
      label: "OpenClaw",
      status: "warning",
      message: "没有检测到内置 OpenClaw 运行文件。",
      fix: "重新安装最新版哈基Mi，或使用高级办公模型。"
    };
  }
  return {
    id: "openclaw",
    label: "OpenClaw",
    status: "ready",
    message: "内置 OpenClaw 运行文件可用。"
  };
}

function checkWechat(settings: AppSettings): CapabilityRow {
  const wechat = settings.channels.find((channel) => channel.provider === "wechat");
  if (!wechat?.enabled) {
    return {
      id: "wechat",
      label: "微信",
      status: "warning",
      message: "微信通道未启用。",
      fix: "在通道页点击安装/扫码并完成授权。"
    };
  }
  if (wechat.status !== "connected") {
    return {
      id: "wechat",
      label: "微信",
      status: "warning",
      message: `微信通道状态为 ${wechat.status}。`,
      fix: "在通道页测试通道，必要时重新扫码。"
    };
  }
  return {
    id: "wechat",
    label: "微信",
    status: "ready",
    message: "微信消息可以接入当前办公会话。"
  };
}
