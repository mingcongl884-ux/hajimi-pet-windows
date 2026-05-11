import { query, type Options, type PermissionMode, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ChatClientError, type ChatResponse } from "./chatClient.js";
import type { AgentPermissionMode, AgentSettings, ModelProfile } from "./settingsStore.js";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "LS"];
const EDIT_TOOLS = ["Edit", "MultiEdit", "Write"];
const SAFE_AUTO_TOOLS = [...READ_ONLY_TOOLS, ...EDIT_TOOLS];
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export async function runClaudeAgentTask(
  model: ModelProfile,
  agent: AgentSettings,
  task: string
): Promise<ChatResponse> {
  if (!agent.workspaceDir.trim()) {
    throw new ChatClientError("malformed-response", "Choose a workspace before using advanced work mode.");
  }

  return runClaudeQuery(model, task, {
    cwd: agent.workspaceDir,
    maxTurns: 12,
    ...buildClaudePermissionOptions(agent),
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: buildAgentAppendPrompt(model.systemPrompt, agent)
    }
  });
}

export async function testClaudeAgentModel(model: ModelProfile): Promise<string> {
  const response = await runClaudeQuery(model, "Reply with OK only.", {
    tools: [],
    maxTurns: 1,
    systemPrompt: model.systemPrompt.trim() || "You are a concise assistant."
  });

  return response.content;
}

export function toClaudePermissionMode(mode: AgentPermissionMode): PermissionMode {
  if (mode === "full-access") {
    return "bypassPermissions";
  }
  if (mode === "auto-review") {
    return "acceptEdits";
  }
  return "dontAsk";
}

export function buildClaudePermissionOptions(agent: AgentSettings): Pick<
  Options,
  "allowedTools" | "allowDangerouslySkipPermissions" | "canUseTool" | "permissionMode" | "tools"
> {
  const permissionMode = toClaudePermissionMode(agent.permissionMode);
  if (agent.permissionMode === "full-access") {
    return {
      tools: { type: "preset", preset: "claude_code" },
      permissionMode,
      allowDangerouslySkipPermissions: true
    };
  }

  if (agent.permissionMode === "auto-review") {
    return {
      tools: { type: "preset", preset: "claude_code" },
      allowedTools: SAFE_AUTO_TOOLS,
      permissionMode,
      canUseTool: async (toolName, input) => decideToolUse(toolName, input, true)
    };
  }

  return {
    tools: READ_ONLY_TOOLS,
    allowedTools: READ_ONLY_TOOLS,
    permissionMode,
    canUseTool: async (toolName, input) => decideToolUse(toolName, input, false)
  };
}

async function runClaudeQuery(model: ModelProfile, prompt: string, options: Options): Promise<ChatResponse> {
  const env = buildClaudeEnvironment(model);

  const messages: SDKMessage[] = [];
  try {
    for await (const message of query({
      prompt,
      options: {
        env,
        model: model.model.trim() || undefined,
        ...options
      }
    })) {
      messages.push(message);
    }
  } catch (error) {
    throw new ChatClientError(
      "provider-error",
      error instanceof Error ? error.message : "Claude Agent SDK returned an error."
    );
  }

  const result = readResult(messages);
  if (!result) {
    throw new ChatClientError("malformed-response", "Claude Agent SDK returned an invalid response.");
  }

  return { role: "assistant", content: result };
}

export function buildClaudeEnvironment(
  model: ModelProfile,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    CLAUDE_AGENT_SDK_CLIENT_APP: "hajimi-pet/0.1"
  };
  const apiKey = model.apiKey.trim();
  const baseUrl = normalizeAnthropicBaseUrl(model.baseUrl, Boolean(apiKey));
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  if (baseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }
  return env;
}

function decideToolUse(toolName: string, input: Record<string, unknown>, allowSafeBash: boolean): Promise<PermissionResult> {
  if (READ_ONLY_TOOLS.includes(toolName) || EDIT_TOOLS.includes(toolName)) {
    return Promise.resolve({ behavior: "allow", decisionClassification: "user_temporary" });
  }
  if (toolName === "Bash" && allowSafeBash && !isDangerousCommand(String(input.command ?? ""))) {
    return Promise.resolve({ behavior: "allow", decisionClassification: "user_temporary" });
  }
  return Promise.resolve({
    behavior: "deny",
    message: "当前权限模式不允许这个工具。请切换到完全访问权限后重试。",
    decisionClassification: "user_reject"
  });
}

function readResult(messages: SDKMessage[]): string | undefined {
  const resultMessage = [...messages].reverse().find((message) => message.type === "result");
  if (resultMessage?.type === "result") {
    if (resultMessage.subtype === "success" && resultMessage.result.trim()) {
      return resultMessage.result.trim();
    }
    if (resultMessage.subtype !== "success") {
      return resultMessage.errors?.join("\n") || "Claude Agent SDK stopped before producing a result.";
    }
  }

  const assistantText = messages
    .filter((message) => message.type === "assistant")
    .flatMap((message) => message.type === "assistant" ? message.message.content : [])
    .map(readContentBlockText)
    .filter(Boolean)
    .join("\n")
    .trim();

  return assistantText || undefined;
}

function readContentBlockText(block: unknown): string {
  if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
    const text = (block as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function buildAgentAppendPrompt(systemPrompt: string, agent: AgentSettings): string {
  return [
    systemPrompt.trim() || "You are HaJiMi, a friendly desktop pet office agent.",
    "You are running inside the HaJiMi desktop pet app as the advanced office mode.",
    `Workspace: ${agent.workspaceDir}`,
    `Permission mode: ${agent.permissionMode}`,
    "Keep paths relative to the workspace when possible.",
    "Before editing, inspect the relevant files. After changes, run a suitable verification command when permission allows it.",
    "Summarize what changed, what you verified, and any follow-up risk."
  ].join("\n");
}

function normalizeAnthropicBaseUrl(baseUrl: string, hasApiKey: boolean): string | undefined {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed || /^https:\/\/api\.openai\.com\/?$/i.test(trimmed)) {
    return hasApiKey ? DEFAULT_ANTHROPIC_BASE_URL : undefined;
  }
  if (!hasApiKey && trimmed.toLowerCase() === DEFAULT_ANTHROPIC_BASE_URL) {
    return undefined;
  }
  if (hasApiKey && /^https:\/\/api\.anthropic\.com\/?$/i.test(trimmed)) {
    return DEFAULT_ANTHROPIC_BASE_URL;
  }
  return trimmed;
}

function isDangerousCommand(command: string): boolean {
  return /\b(del|erase|rd|rmdir|remove-item|rm|format|shutdown|restart-computer|reg\s+delete|set-executionpolicy)\b/i
    .test(command);
}
