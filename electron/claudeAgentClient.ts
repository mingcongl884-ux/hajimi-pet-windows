import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query, type Options, type PermissionMode, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ChatClientError, type ChatFileOutput, type ChatResponse } from "./chatClient.js";
import type { AgentPermissionMode, AgentSettings, ModelProfile } from "./settingsStore.js";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "LS"];
const EDIT_TOOLS = ["Edit", "MultiEdit", "Write"];
const SAFE_AUTO_TOOLS = [...READ_ONLY_TOOLS, ...EDIT_TOOLS, "Bash"];
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const CLAUDE_EXECUTABLE_ENV_KEYS = [
  "CLAUDE_CODE_EXECUTABLE_PATH",
  "CLAUDE_CODE_PATH",
  "ANTHROPIC_CLAUDE_CODE_PATH"
];

export type ClaudeAgentTaskOptions = {
  abortController?: AbortController;
  mcpServers?: Options["mcpServers"];
  executionContext?: string;
};

export async function runClaudeAgentTask(
  model: ModelProfile,
  agent: AgentSettings,
  task: string,
  options: AbortController | ClaudeAgentTaskOptions = {}
): Promise<ChatResponse> {
  if (!agent.workspaceDir.trim()) {
    throw new ChatClientError("malformed-response", "Choose a workspace before using advanced work mode.");
  }

  const runOptions = options instanceof AbortController ? { abortController: options } : options;
  return runClaudeQuery(model, task, {
    cwd: agent.workspaceDir,
    maxTurns: 24,
    ...buildClaudePermissionOptions(agent),
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: buildAgentAppendPrompt(model.systemPrompt, agent, runOptions.executionContext)
    },
    ...(runOptions.mcpServers ? { mcpServers: runOptions.mcpServers } : {}),
    abortController: runOptions.abortController
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
  const pathToClaudeCodeExecutable = resolveClaudeCodeExecutable(env);

  const messages: SDKMessage[] = [];
  try {
    const sdkOptions: Options = {
      env,
      model: model.model.trim() || undefined,
      ...options
    };
    if (pathToClaudeCodeExecutable && !sdkOptions.pathToClaudeCodeExecutable) {
      sdkOptions.pathToClaudeCodeExecutable = pathToClaudeCodeExecutable;
    }

    for await (const message of query({
      prompt,
      options: sdkOptions
    })) {
      messages.push(message);
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new ChatClientError("cancelled", "已停止生成。");
    }
    throw new ChatClientError(
      "provider-error",
      formatClaudeAgentError(error)
    );
  }

  const result = readResult(messages);
  if (!result) {
    throw new ChatClientError("malformed-response", "Claude Agent SDK returned an invalid response.");
  }

  const fileOutputs = readClaudeFileOutputs(messages, typeof options.cwd === "string" ? options.cwd : undefined);
  return { role: "assistant", content: result, fileOutputs: fileOutputs.length ? fileOutputs : undefined };
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const typed = error as { name?: unknown; code?: unknown; message?: unknown };
  const message = typeof typed.message === "string" ? typed.message : "";
  return typed.name === "AbortError" || typed.code === "ABORT_ERR" || /abort|cancel/i.test(message);
}

export function resolveClaudeCodeExecutable(baseEnv: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of CLAUDE_EXECUTABLE_ENV_KEYS) {
    const configuredPath = baseEnv[key]?.trim();
    if (configuredPath && isExecutableFile(configuredPath)) {
      return configuredPath;
    }
  }

  return [
    ...findClaudeOnPath(baseEnv),
    ...commonClaudeInstallCandidates(baseEnv),
    ...bundledClaudeExecutableCandidates()
  ].find(isExecutableFile);
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

export function readClaudeFileOutputs(messages: readonly unknown[], workspaceDir?: string): ChatFileOutput[] {
  const outputs = new Map<string, ChatFileOutput>();
  for (const message of messages) {
    for (const block of readMessageBlocks(message)) {
      const toolName = readToolName(block);
      if (!toolName || !["Write", "Edit", "MultiEdit"].includes(toolName)) {
        continue;
      }
      const input = readToolInput(block);
      const rawPath = readToolFilePath(input);
      if (!rawPath) {
        continue;
      }
      const path = normalizeToolOutputPath(rawPath, workspaceDir);
      outputs.set(path, {
        path,
        name: basename(path),
        size: readToolOutputSize(input, rawPath, workspaceDir)
      });
    }
  }
  return [...outputs.values()];
}

function readMessageBlocks(message: unknown): unknown[] {
  if (!message || typeof message !== "object") {
    return [];
  }
  const outer = message as { message?: unknown; content?: unknown };
  const inner = outer.message && typeof outer.message === "object"
    ? outer.message as { content?: unknown }
    : undefined;
  const content = inner?.content ?? outer.content;
  return Array.isArray(content) ? content : [];
}

function readToolName(block: unknown): string | undefined {
  if (!block || typeof block !== "object") {
    return undefined;
  }
  const typed = block as { type?: unknown; name?: unknown };
  if (typed.type !== "tool_use" && typed.type !== "server_tool_use") {
    return undefined;
  }
  return typeof typed.name === "string" ? typed.name : undefined;
}

function readToolInput(block: unknown): Record<string, unknown> {
  if (!block || typeof block !== "object") {
    return {};
  }
  const input = (block as { input?: unknown }).input;
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function readToolFilePath(input: Record<string, unknown>): string | undefined {
  const value = input.file_path ?? input.path;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeToolOutputPath(filePath: string, workspaceDir?: string): string {
  if (!workspaceDir) {
    return filePath;
  }
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(workspaceDir, filePath);
  const relativePath = relative(workspaceDir, absolutePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function readToolOutputSize(input: Record<string, unknown>, filePath: string, workspaceDir?: string): number | undefined {
  if (typeof input.content === "string") {
    return Buffer.byteLength(input.content, "utf8");
  }
  if (!workspaceDir) {
    return undefined;
  }
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(workspaceDir, filePath);
  try {
    return statSync(absolutePath).size;
  } catch {
    return undefined;
  }
}

function buildAgentAppendPrompt(systemPrompt: string, agent: AgentSettings, executionContext = "Local device"): string {
  return [
    systemPrompt.trim() || "You are HaJiMi, a friendly desktop pet office agent.",
    "You are running inside the HaJiMi desktop pet app as the advanced office mode.",
    `Workspace: ${agent.workspaceDir}`,
    `Permission mode: ${agent.permissionMode}`,
    `Current execution environment: ${executionContext}`,
    "Keep paths relative to the workspace when possible.",
    "When the user asks to launch an app, check the current permission mode and use Bash with a safe Start-Process command instead of only explaining manual steps.",
    "When the user asks for output files, create the files with Write/Edit or Bash and then stop with a concise summary. If they ask for Desktop output, use the user's Desktop folder.",
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

function formatClaudeAgentError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Claude Agent SDK returned an error.";
  if (/native binary not found|pathToClaudeCodeExecutable|Claude Code executable/i.test(message)) {
    return [
      "未找到 Claude Code 执行文件。高级办公/CC Switch 需要可用的 claude.exe 作为执行器。",
      "请先安装 Claude Code，并确认终端运行 claude --version 能显示版本；也可以设置 CLAUDE_CODE_EXECUTABLE_PATH 指向 claude.exe。",
      `原始错误：${message}`
    ].join("\n");
  }
  return message;
}

function findClaudeOnPath(baseEnv: NodeJS.ProcessEnv): string[] {
  const pathValue = baseEnv.PATH ?? baseEnv.Path ?? baseEnv.path ?? "";
  const pathExts = process.platform === "win32"
    ? (baseEnv.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const commandNames = process.platform === "win32" ? ["claude", "claude.exe"] : ["claude"];

  const candidates: string[] = [];
  for (const pathEntry of pathValue.split(delimiter).filter(Boolean)) {
    for (const commandName of commandNames) {
      if (commandName.includes(".")) {
        candidates.push(join(pathEntry, commandName));
        continue;
      }
      for (const ext of pathExts) {
        candidates.push(join(pathEntry, `${commandName}${ext.toLowerCase()}`));
        candidates.push(join(pathEntry, `${commandName}${ext.toUpperCase()}`));
      }
    }
  }
  return unique(candidates);
}

function commonClaudeInstallCandidates(baseEnv: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates: string[] = [];
  const userProfile = baseEnv.USERPROFILE;
  const localAppData = baseEnv.LOCALAPPDATA;
  const appData = baseEnv.APPDATA;

  if (userProfile) {
    candidates.push(join(userProfile, ".local", "bin", "claude.exe"));
  }
  if (appData) {
    candidates.push(join(appData, "npm", "claude.cmd"));
  }
  if (localAppData) {
    const wingetPackages = join(localAppData, "Microsoft", "WinGet", "Packages");
    try {
      for (const entry of readdirSync(wingetPackages, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("Anthropic.ClaudeCode_")) {
          candidates.push(join(wingetPackages, entry.name, "claude.exe"));
        }
      }
    } catch {
      // Missing WinGet package directory is normal on machines using another installer.
    }
  }

  return candidates;
}

function bundledClaudeExecutableCandidates(): string[] {
  const packageName = getClaudeCodePackageName();
  const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
  const resourcesPath = processWithResources.resourcesPath;

  const candidates = [
    join(process.cwd(), "node_modules", "@anthropic-ai", packageName, binaryName),
    resolve(moduleDir, "..", "..", "node_modules", "@anthropic-ai", packageName, binaryName),
    resolve(moduleDir, "..", "node_modules", "@anthropic-ai", packageName, binaryName)
  ];

  if (resourcesPath) {
    candidates.unshift(
      join(resourcesPath, "app.asar.unpacked", "node_modules", "@anthropic-ai", packageName, binaryName),
      join(resourcesPath, "app", "node_modules", "@anthropic-ai", packageName, binaryName)
    );
  }

  return unique(candidates);
}

function getClaudeCodePackageName(): string {
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "claude-agent-sdk-win32-arm64" : "claude-agent-sdk-win32-x64";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "claude-agent-sdk-darwin-arm64" : "claude-agent-sdk-darwin-x64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "claude-agent-sdk-linux-arm64" : "claude-agent-sdk-linux-x64";
  }
  return "claude-agent-sdk-win32-x64";
}

function isExecutableFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return existsSync(filePath);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
