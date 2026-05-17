import { constants, existsSync } from "node:fs";
import { access, mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CapabilityCheckResult, CapabilityRepairResult, CapabilityRow } from "../src/lib/capabilityCheck.js";
import { resolveClaudeCodeExecutable } from "./claudeAgentClient.js";
import { resolveBundledOpenClawCli } from "./openClawAgentClient.js";
import type { AppSettings } from "./settingsStore.js";

const OPENCLAW_TEMPLATE_FILES: Record<string, string> = {
  "AGENTS.md": "# AGENTS.md - HaJiMi Workspace\n\nYou are running inside HaJiMi office mode. Work in the configured workspace, keep outputs visible to the user, and avoid destructive changes unless permission allows them.\n",
  "SOUL.md": "# SOUL.md\n\nYou are a concise, helpful desktop office agent.\n",
  "TOOLS.md": "# TOOLS.md\n\nUse available tools to inspect files, edit documents, and report created outputs.\n",
  "USER.md": "# USER.md\n\nReply in the user's language and ask before risky actions.\n",
  "IDENTITY.md": "# IDENTITY.md\n\nName: HaJiMi\nRole: Desktop pet office agent\n",
  "HEARTBEAT.md": "# HEARTBEAT.md\n\nOffer lightweight status updates when useful.\n",
  "BOOTSTRAP.md": "# BOOTSTRAP.md\n\nInitialize this workspace for HaJiMi office tasks.\n"
};

export async function checkCapabilities(settings: AppSettings): Promise<CapabilityCheckResult> {
  const rows = await Promise.all([
    checkModel(settings),
    checkWorkspace(settings),
    checkOrdinaryOffice(),
    checkClaudeCode(),
    checkOpenClaw(),
    checkWechat(settings),
    checkRemoteBridge(settings)
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
      fix: "在模型页添加一个 OpenAI 兼容或 Claude Agent SDK 模型。",
      repair: { id: "configure-model", label: "去配置", kind: "manual" }
    };
  }
  if (!model.apiKey.trim() || !model.baseUrl.trim() || !model.model.trim()) {
    return {
      id: "model",
      label: "模型",
      status: "warning",
      message: "当前模型配置不完整。",
      fix: "补全 API Base URL、API Key 和模型名后点击测试连接。",
      repair: { id: "assistant-diagnosis", label: "辅助诊断", kind: "assistant" }
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
      fix: "在左侧项目区选择一个目录。",
      repair: { id: "choose-workspace", label: "选择目录", kind: "manual" }
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
      fix: "换一个有权限的目录，或检查目录是否仍然存在。",
      repair: { id: "assistant-diagnosis", label: "辅助诊断", kind: "assistant" }
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
      fix: "安装 Claude Code 或通过 CC Switch 配好 Claude 命令后再使用高级办公。",
      repair: { id: "assistant-diagnosis", label: "辅助诊断", kind: "assistant" }
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
      fix: "重新安装最新版哈基Mi，或使用高级办公模型。",
      repair: { id: "assistant-diagnosis", label: "辅助诊断", kind: "assistant" }
    };
  }
  if (!hasOpenClawTemplates(cli)) {
    return {
      id: "openclaw",
      label: "OpenClaw",
      status: "warning",
      message: "OpenClaw 工作区模板不完整。",
      fix: "点击自动修复会补齐 AGENTS.md 等基础模板。",
      repair: { id: "repair-openclaw-runtime", label: "自动修复", kind: "automatic" }
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
      fix: "在通道页点击安装/扫码并完成授权。",
      repair: { id: "assistant-diagnosis", label: "辅助诊断", kind: "assistant" }
    };
  }
  if (wechat.status !== "connected") {
    return {
      id: "wechat",
      label: "微信",
      status: "warning",
      message: `微信通道状态为 ${wechat.status}。`,
      fix: "在通道页测试通道，必要时重新扫码。",
      repair: { id: "restart-wechat-channel", label: "自动重启", kind: "automatic" }
    };
  }
  return {
    id: "wechat",
    label: "微信",
    status: "ready",
    message: "微信消息可以接入当前办公会话。"
  };
}

export function checkRemoteBridge(settings: AppSettings): CapabilityRow {
  if (!settings.remoteBridge.enabled) {
    return {
      id: "remote-bridge",
      label: "跨电脑桥接",
      status: "ready",
      message: "跨电脑桥接未启用；本机办公不受影响。"
    };
  }
  const bridgeBroken = settings.remoteBridge.host.status === "error" || settings.remoteBridge.relay.status === "error";
  if (bridgeBroken) {
    return {
      id: "remote-bridge",
      label: "跨电脑桥接",
      status: "warning",
      message: `本机 ${settings.remoteBridge.host.status}，云中转 ${settings.remoteBridge.relay.status}。`,
      fix: "点击自动修复会重启桥接服务。",
      repair: { id: "restart-remote-bridge", label: "自动重启", kind: "automatic" }
    };
  }
  return {
    id: "remote-bridge",
    label: "跨电脑桥接",
    status: "ready",
    message: "桥接配置可用。"
  };
}

export async function repairOpenClawRuntime(): Promise<CapabilityRepairResult> {
  const cli = resolveBundledOpenClawCli();
  if (!cli) {
    return {
      checkedAt: new Date().toISOString(),
      status: "needs-action",
      message: "没有找到 OpenClaw 运行文件，无法自动补齐模板。请重新安装最新版哈基Mi。"
    };
  }

  const templatesDir = resolveOpenClawTemplatesDir(cli);
  try {
    await mkdir(templatesDir, { recursive: true });
    await Promise.all(Object.entries(OPENCLAW_TEMPLATE_FILES).map(([name, content]) =>
      existsSync(join(templatesDir, name)) ? Promise.resolve() : writeFile(join(templatesDir, name), content, "utf8")
    ));
    return {
      checkedAt: new Date().toISOString(),
      status: "repaired",
      message: "已补齐 OpenClaw 工作区模板。"
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      status: "failed",
      message: error instanceof Error ? error.message : "补齐 OpenClaw 工作区模板失败。"
    };
  }
}

export function buildCapabilityRepairPrompt(rows: CapabilityRow[], targetRowId?: string): string {
  const target = targetRowId ? rows.find((row) => row.id === targetRowId) : undefined;
  const problemRows = rows.filter((row) => row.status !== "ready");
  return [
    "你是哈基Mi的故障自修复助手。请根据下面的能力体检结果给出简短、可执行、低风险的修复建议。",
    "不要建议用户执行危险命令。需要区分：能自动修复、需要手动配置、需要重新安装。",
    target ? `重点诊断：${target.label} - ${target.message}${target.fix ? `。建议：${target.fix}` : ""}` : "",
    "体检结果：",
    ...problemRows.map((row) => `- ${row.label}: ${row.status}; ${row.message}${row.fix ? `; ${row.fix}` : ""}`)
  ].filter(Boolean).join("\n");
}

function hasOpenClawTemplates(cliPath: string): boolean {
  return existsSync(join(resolveOpenClawTemplatesDir(cliPath), "AGENTS.md"));
}

function resolveOpenClawTemplatesDir(cliPath: string): string {
  return join(dirname(cliPath), "docs", "reference", "templates");
}
