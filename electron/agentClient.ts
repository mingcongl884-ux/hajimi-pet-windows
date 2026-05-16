import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import type { ChatApiSettings, ChatFileOutput, ChatResponse } from "./chatClient.js";
import { buildOpenAIChatCompletionsEndpoint } from "./chatClient.js";
import { ChatClientError, fetchChatCompletion } from "./chatClient.js";
import type { AgentSettings } from "./settingsStore.js";
import { readPetAction, type PetAction } from "../src/lib/petActions.js";
import {
  batchFiles,
  buildProcessListCommand,
  buildSystemStatusCommand,
  createSpreadsheetFile,
  inspectDocumentFile,
  splitSpreadsheetFile
} from "./officeTools.js";

export type CommandPolicy = {
  enabled: boolean;
  blockDangerousCommands: boolean;
};

type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  text?: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolResult = {
  content: string;
  fileOutput?: ChatFileOutput;
  fileOutputs?: ChatFileOutput[];
};

const MAX_STEPS = 6;
const MAX_TOOL_OUTPUT = 12000;

export async function runAgentTask(
  fetchImpl: FetchLike,
  api: ChatApiSettings,
  agent: AgentSettings,
  task: string,
  signal?: AbortSignal
): Promise<ChatResponse> {
  if (!api.apiKey.trim()) {
    throw new ChatClientError("missing-api-key", "API key is required.");
  }
  if (!agent.workspaceDir.trim()) {
    throw new ChatClientError("malformed-response", "Choose a workspace before using work mode.");
  }

  const messages: AgentMessage[] = [
    { role: "system", content: buildAgentPrompt(api.systemPrompt, agent) },
    { role: "user", content: task }
  ];
  const petActions: PetAction[] = [];
  const fileOutputs: ChatFileOutput[] = [];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await fetchChatCompletion(fetchImpl, buildOpenAIChatCompletionsEndpoint(api.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: api.model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto"
      }),
      signal
    });

    if (!response.ok) {
      const errorMessage = await readProviderErrorMessage(response, response.statusText || "Agent provider returned an error.");
      if (step === 0 && response.status === 400) {
        return runAgentTaskWithTextTools(fetchImpl, api, agent, task, signal, errorMessage);
      }
      throw new ChatClientError(
        "provider-error",
        errorMessage,
        response.status
      );
    }

    const message = readAssistantMessage(await response.json());
    if (!message) {
      throw new ChatClientError("malformed-response", "Agent provider returned an invalid response.");
    }

    messages.push(message);
    if (!message.tool_calls?.length) {
      return {
        role: "assistant",
        content: message.content || (petActions.length ? "好的。" : "Done."),
        petActions: petActions.length ? petActions : undefined,
        fileOutputs: fileOutputs.length ? fileOutputs : undefined
      };
    }

    for (const toolCall of message.tool_calls) {
      const petAction = readPetToolCall(toolCall);
      if (petAction) {
        petActions.push(petAction);
      }
      const result = petAction ? { content: "Pet action accepted." } : await executeToolCall(agent, toolCall);
      if (result.fileOutput) {
        fileOutputs.push(result.fileOutput);
      }
      if (result.fileOutputs?.length) {
        fileOutputs.push(...result.fileOutputs);
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: trimToolOutput(result.content)
      });
    }
  }

  return {
    role: "assistant",
    content: petActions.length ? "我已经执行了宠物动作。" : "I reached the step limit. I stopped before doing more work.",
    petActions: petActions.length ? petActions : undefined,
    fileOutputs: fileOutputs.length ? fileOutputs : undefined
  };
}

async function runAgentTaskWithTextTools(
  fetchImpl: FetchLike,
  api: ChatApiSettings,
  agent: AgentSettings,
  task: string,
  signal: AbortSignal | undefined,
  nativeToolError: string
): Promise<ChatResponse> {
  const messages: AgentMessage[] = [
    { role: "system", content: buildTextToolPrompt(api.systemPrompt, agent, nativeToolError) },
    { role: "user", content: task }
  ];
  const petActions: PetAction[] = [];
  const fileOutputs: ChatFileOutput[] = [];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await fetchChatCompletion(fetchImpl, buildOpenAIChatCompletionsEndpoint(api.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: api.model,
        messages
      }),
      signal
    });

    if (!response.ok) {
      throw new ChatClientError(
        "provider-error",
        await readProviderErrorMessage(response, response.statusText || "Agent provider returned an error."),
        response.status
      );
    }

    const message = readAssistantMessage(await response.json());
    if (!message) {
      throw new ChatClientError("malformed-response", "Agent provider returned an invalid response.");
    }

    messages.push(message);
    const toolCalls = readTextToolCalls(message.content ?? "");
    if (!toolCalls.length) {
      return {
        role: "assistant",
        content: stripTextToolCalls(message.content || (petActions.length ? "好的。" : "Done.")),
        petActions: petActions.length ? petActions : undefined,
        fileOutputs: fileOutputs.length ? fileOutputs : undefined
      };
    }

    const toolResults: string[] = [];
    for (const toolCall of toolCalls) {
      const petAction = readPetToolCall(toolCall);
      if (petAction) {
        petActions.push(petAction);
      }
      const result = petAction ? { content: "Pet action accepted." } : await executeToolCall(agent, toolCall);
      if (result.fileOutput) {
        fileOutputs.push(result.fileOutput);
      }
      if (result.fileOutputs?.length) {
        fileOutputs.push(...result.fileOutputs);
      }
      toolResults.push([
        `Tool: ${toolCall.function.name}`,
        `Arguments: ${toolCall.function.arguments}`,
        "Result:",
        trimToolOutput(result.content)
      ].join("\n"));
    }

    messages.push({
      role: "user",
      content: `Tool results are below. Continue the task or provide the final answer.\n\n${toolResults.join("\n\n---\n\n")}`
    });
  }

  return {
    role: "assistant",
    content: petActions.length ? "我已经执行了宠物动作。" : "I reached the step limit. I stopped before doing more work.",
    petActions: petActions.length ? petActions : undefined,
    fileOutputs: fileOutputs.length ? fileOutputs : undefined
  };
}

export function resolveWorkspacePath(workspaceDir: string, relativePath: string): string {
  const root = resolve(workspaceDir);
  const target = resolve(root, relativePath || ".");
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`Path is outside workspace: ${relativePath}`);
  }

  return target;
}

export function resolveWritablePath(
  agent: AgentSettings,
  relativePath: string,
  homeDir = process.env.USERPROFILE ?? process.env.HOME ?? ""
): string {
  const mode = agent.permissionMode ?? (agent.allowCommands ? "auto-review" : "default");
  const normalizedPath = relativePath.replace(/\//g, "\\").replace(/^\.\\/, "");
  const desktopMatch = normalizedPath.match(/^(?:desktop|桌面)\\(.+)/i);

  if (desktopMatch && mode === "default") {
    throw new Error(`Path is outside workspace: ${relativePath}`);
  }

  if (mode !== "default" && desktopMatch && homeDir) {
    return resolve(homeDir, "Desktop", desktopMatch[1]);
  }

  if (mode !== "default" && isAbsolute(relativePath) && isInsideKnownUserOutputDir(relativePath, homeDir)) {
    return resolve(relativePath);
  }

  return resolveWorkspacePath(agent.workspaceDir, relativePath);
}

function isInsideKnownUserOutputDir(filePath: string, homeDir: string): boolean {
  if (!homeDir.trim()) {
    return false;
  }
  const target = resolve(filePath).toLowerCase();
  const desktopRoot = resolve(homeDir, "Desktop").toLowerCase();
  const downloadsRoot = resolve(homeDir, "Downloads").toLowerCase();
  return isInsidePath(target, desktopRoot) || isInsidePath(target, downloadsRoot);
}

function isInsidePath(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

async function executeToolCall(agent: AgentSettings, toolCall: ToolCall): Promise<ToolResult> {
  const args = parseToolArguments(toolCall.function.arguments);
  switch (toolCall.function.name) {
    case "list_files":
      return { content: await listFiles(agent.workspaceDir, String(args.path ?? ".")) };
    case "read_file":
      return { content: await readTextFile(agent.workspaceDir, String(args.path ?? "")) };
    case "search_files":
      return {
        content: await searchFiles(
          agent.workspaceDir,
          String(args.query ?? ""),
          String(args.path ?? "."),
          typeof args.fileGlob === "string" ? args.fileGlob : undefined
        )
      };
    case "write_file":
      return writeTextFile(agent, String(args.path ?? ""), String(args.content ?? ""));
    case "open_application":
      return { content: await openApplication(agent, String(args.appName ?? args.name ?? "")) };
    case "inspect_document":
      return inspectDocumentFile(agent.workspaceDir, String(args.path ?? ""));
    case "create_spreadsheet":
      return createSpreadsheetFile(agent, {
        path: String(args.path ?? ""),
        headers: readStringArray(args.headers),
        rows: readTableRows(args.rows)
      });
    case "split_spreadsheet":
      return splitSpreadsheetFile(agent, {
        path: String(args.path ?? ""),
        parts: readOptionalNumber(args.parts),
        rowsPerFile: readOptionalNumber(args.rowsPerFile),
        outputDir: typeof args.outputDir === "string" ? args.outputDir : undefined
      });
    case "get_system_status":
      return { content: await runCommand(agent, buildSystemStatusCommand()) };
    case "list_processes":
      return { content: await runCommand(agent, buildProcessListCommand(readOptionalNumber(args.limit) ?? 12)) };
    case "batch_files":
      return batchFiles(
        agent,
        args.operation === "move" ? "move" : "copy",
        String(args.sourceDir ?? "."),
        String(args.outputDir ?? "batch-output"),
        typeof args.extension === "string" ? args.extension : undefined
      );
    case "run_command":
      return { content: await runCommand(agent, String(args.command ?? "")) };
    default:
      return { content: `Unknown tool: ${toolCall.function.name}` };
  }
}

export async function listFiles(workspaceDir: string, relativePath: string): Promise<string> {
  const dir = resolveWorkspacePath(workspaceDir, relativePath);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .slice(0, 200)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n") || "(empty)";
}

export async function readTextFile(workspaceDir: string, relativePath: string): Promise<string> {
  const filePath = resolveWorkspacePath(workspaceDir, relativePath);
  return trimToolOutput(await readFile(filePath, "utf8"));
}

async function searchFiles(
  workspaceDir: string,
  query: string,
  relativePath: string,
  fileGlob?: string
): Promise<string> {
  if (!query.trim()) {
    return "Search query is empty.";
  }

  const target = resolveWorkspacePath(workspaceDir, relativePath);
  const args = ["--line-number", "--hidden", "--glob", "!node_modules/**"];
  if (fileGlob?.trim()) {
    args.push("--glob", fileGlob.trim());
  }
  args.push(query, target);

  const result = await runProcess("rg", args, workspaceDir, 30000);
  if (result.code === 0) {
    return result.output;
  }
  if (result.code === 1) {
    return "No matches.";
  }
  return `Search failed:\n${result.output}`;
}

export async function writeTextFile(agent: AgentSettings, relativePath: string, content: string): Promise<ToolResult> {
  const filePath = resolveWritablePath(agent, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return {
    content: `Wrote ${relativePath}`,
    fileOutput: {
      path: relativePath,
      name: basename(relativePath),
      size: Buffer.byteLength(content, "utf8")
    }
  };
}

export async function openApplication(agent: AgentSettings, appName: string): Promise<string> {
  const policy = getCommandPolicy(agent);
  if (!policy.enabled) {
    return "Application launch is disabled in the current permission mode. Switch to auto-review or full-access and try again.";
  }

  const command = buildOpenApplicationCommand(appName);
  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", command], agent.workspaceDir, 15000);
  return `${result.output}\nExit code: ${result.code}`;
}

export function buildOpenApplicationCommand(appName: string): string {
  const normalized = appName.trim().toLowerCase();
  if (!normalized) {
    return "Write-Output 'Application name is empty.'; exit 1";
  }

  if (/^(wechat|weixin|\u5fae\u4fe1|\u5fae\u4fe1\u5ba2\u6237\u7aef)$/iu.test(normalized)) {
    return [
      "$ErrorActionPreference = 'Stop'",
      "$candidates = @()",
      "if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Tencent\\WeChat\\WeChat.exe') }",
      "if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Tencent\\WeChat\\WeChat.exe') }",
      "if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Tencent\\WeChat\\WeChat.exe'); $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\\Tencent\\WeChat\\WeChat.exe') }",
      "$target = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1",
      "if ($target) { Start-Process -FilePath $target; Write-Output \"Launched WeChat: $target\"; exit 0 }",
      "foreach ($name in @('WeChat', 'wechat')) { try { Start-Process -FilePath $name; Write-Output \"Launched WeChat via command: $name\"; exit 0 } catch {} }",
      "Write-Output 'WeChat was not found in common install locations.'",
      "exit 1"
    ].join("; ");
  }

  return [
    "$ErrorActionPreference = 'Stop'",
    `Start-Process -FilePath ${psSingleQuote(appName.trim())}`,
    `Write-Output ${psSingleQuote(`Launched ${appName.trim()}`)}`
  ].join("; ");
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function runCommand(agent: AgentSettings, command: string): Promise<string> {
  const policy = getCommandPolicy(agent);
  if (!policy.enabled) {
    return "Command execution is disabled in settings.";
  }
  if (policy.blockDangerousCommands && isDangerousCommand(command)) {
    return "Blocked a potentially destructive command.";
  }

  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", command], agent.workspaceDir, 60000);
  return `${result.output}\nExit code: ${result.code}`;
}

export function getCommandPolicy(agent: AgentSettings): CommandPolicy {
  const mode = agent.permissionMode ?? (agent.allowCommands ? "auto-review" : "default");
  if (mode === "full-access") {
    return { enabled: true, blockDangerousCommands: false };
  }
  if (mode === "auto-review") {
    return { enabled: true, blockDangerousCommands: true };
  }
  return { enabled: false, blockDangerousCommands: true };
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true
    });
    let output = "";
    const finish = (code: number | null, message: string) => resolvePromise({ code, output: trimToolOutput(message) });
    const timeout = setTimeout(() => {
      child.kill();
      finish(null, `${output}\nCommand timed out.`);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      finish(null, error.message);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      finish(code, output);
    });
  });
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function readProviderErrorMessage(
  response: Awaited<ReturnType<FetchLike>>,
  fallback: string
): Promise<string> {
  if (!response.text) {
    return fallback;
  }
  try {
    const raw = await response.text();
    const message = readProviderErrorText(raw);
    return message ? `${fallback}: ${message}` : fallback;
  } catch {
    return fallback;
  }
}

function readProviderErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown };
      message?: unknown;
      detail?: unknown;
    };
    const message = parsed.error?.message ?? parsed.message ?? parsed.detail;
    return typeof message === "string" ? message : trimmed.slice(0, 500);
  } catch {
    return trimmed.slice(0, 500);
  }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => item == null ? "" : String(item));
}

function readTableRows(value: unknown): Array<Array<string | number | boolean | null | undefined>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((row) => Array.isArray(row) ? row.map((cell) => {
    if (cell == null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
      return cell;
    }
    return String(cell);
  }) : [String(row)]);
}

function readOptionalNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function readPetToolCall(toolCall: ToolCall): PetAction | undefined {
  if (toolCall.function.name !== "control_pet") {
    return undefined;
  }
  return readPetAction(parseToolArguments(toolCall.function.arguments));
}

function buildAgentPrompt(systemPrompt: string, agent: AgentSettings): string {
  return [
    systemPrompt.trim() || "You are HaJiMi, a friendly desktop pet.",
    "You can help the user do real computer work by using tools, similar to a coding agent.",
    `Workspace: ${agent.workspaceDir}`,
    `Permission mode: ${agent.permissionMode ?? (agent.allowCommands ? "auto-review" : "default")}`,
    "For actionable requests, use tools. Do not say you lack tools before trying the relevant safe tool.",
    "You are not only a text assistant: you have a visible desktop pet body controlled by control_pet. Treat movement requests as requests for your own body.",
    "If the user asks you to jump, move, run, change mood, speak as a bubble, go to a screen edge/corner, play by yourself, review work, wait for a result, or calm down, use control_pet instead of saying you cannot control the GUI.",
    "If the user asks to open or launch an app such as WeChat, use open_application when command permission is enabled.",
    "For Excel/CSV tables use inspect_document, create_spreadsheet, and split_spreadsheet. For Word/PDF/text summaries use inspect_document.",
    "For computer maintenance use get_system_status and list_processes before proposing cleanup or repair steps. Use batch_files for safe file copying or full-access moves.",
    "Use mood=review while reading files or thinking about a work task, mood=waiting while waiting for tool output or a user reply, mood=working for focused office flow, and mood=failed when blocked.",
    "Keep file paths relative to the workspace unless the user explicitly asks for Desktop output and the permission mode is auto-review or full-access.",
    "When the user asks for a spreadsheet, report, document, or any other output file, create it with write_file and mention the path instead of dumping the full file content into chat.",
    "If the user asks for Desktop output, write to Desktop/<filename> in auto-review or full-access mode.",
    "For code or file tasks: inspect relevant files first, make focused edits, run a suitable verification command when available, then summarize the outcome.",
    "Prefer search_files before guessing where code lives. Prefer read_file before write_file.",
    "Explain what you changed or what command output means. Do not claim work is done unless a tool result supports it."
  ].join("\n");
}

function buildTextToolPrompt(systemPrompt: string, agent: AgentSettings, nativeToolError: string): string {
  return [
    buildAgentPrompt(systemPrompt, agent),
    "",
    "Native OpenAI function tools were rejected by this provider, so use HaJiMi text tool calls instead.",
    `Native tool error: ${nativeToolError}`,
    "When you need to call tools, reply with only this JSON inside tags:",
    "<tool_calls>[{\"name\":\"inspect_document\",\"arguments\":{\"path\":\"file.xlsx\"}}]</tool_calls>",
    "Available tool names: control_pet, list_files, read_file, write_file, open_application, inspect_document, create_spreadsheet, split_spreadsheet, get_system_status, list_processes, batch_files, search_files, run_command.",
    "For create_spreadsheet, rows should be arrays of strings. For control_pet, use the same argument names described in the prompt.",
    "After tool results are returned, continue with another <tool_calls> block if more work is needed, otherwise give the final concise answer."
  ].join("\n");
}

function readTextToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of content.matchAll(/<tool_calls>([\s\S]*?)<\/tool_calls>/gi)) {
    const parsed = parseToolArguments(match[1]);
    const rawCalls = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { calls?: unknown }).calls) ? (parsed as { calls: unknown[] }).calls : [];
    for (const rawCall of rawCalls) {
      if (!rawCall || typeof rawCall !== "object") {
        continue;
      }
      const typed = rawCall as { name?: unknown; arguments?: unknown };
      if (typeof typed.name !== "string") {
        continue;
      }
      calls.push({
        id: `text_tool_${calls.length + 1}`,
        type: "function",
        function: {
          name: typed.name,
          arguments: JSON.stringify(typed.arguments && typeof typed.arguments === "object" ? typed.arguments : {})
        }
      });
    }
  }
  return calls;
}

function stripTextToolCalls(content: string): string {
  return content.replace(/<tool_calls>[\s\S]*?<\/tool_calls>/gi, "").trim() || "Done.";
}

function readAssistantMessage(data: unknown): AgentMessage | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const typed = message as { content?: unknown; tool_calls?: unknown };
  return {
    role: "assistant",
    content: typeof typed.content === "string" ? typed.content : "",
    tool_calls: Array.isArray(typed.tool_calls) ? typed.tool_calls as ToolCall[] : undefined
  };
}

function trimToolOutput(output: string): string {
  return output.length > MAX_TOOL_OUTPUT ? `${output.slice(0, MAX_TOOL_OUTPUT)}\n...truncated...` : output;
}

function isDangerousCommand(command: string): boolean {
  return /\b(del|erase|rd|rmdir|remove-item|rm|format|shutdown|restart-computer|reg\s+delete|set-executionpolicy)\b/i
    .test(command);
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_pet",
      description: "Control the visible HaJiMi desktop pet body. Use this for requests like jump, run, move left/right, go to a corner, speak a bubble, open chat, change mood, play by yourself, review work, wait for a result, or calm down.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["say", "jump", "openChat", "stopMovement", "moveToEdge", "moveTo", "runAround", "setMovement", "mood"]
          },
          text: { type: "string", description: "Bubble text for say actions, max 140 characters." },
          edge: { type: "string", enum: ["left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight", "center"] },
          x: { type: "number" },
          y: { type: "number" },
          seconds: { type: "number", minimum: 1, maximum: 30 },
          enabled: { type: "boolean" },
          intensity: { type: "string", enum: ["calm", "normal", "lively"] },
          mood: { type: "string", enum: ["idle", "happy", "working", "waiting", "review", "failed"] }
        },
        required: ["type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a workspace directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file inside the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a UTF-8 text file. Paths are normally inside the workspace; Desktop/<file> is allowed in auto-review or full-access mode.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
          content: { type: "string", description: "New file content." }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_application",
      description: "Open or launch a local desktop application such as WeChat/微信, Notepad, a browser, or an executable path.",
      parameters: {
        type: "object",
        properties: {
          appName: { type: "string", description: "Application name, for example WeChat, 微信, notepad, calc, or an executable path." }
        },
        required: ["appName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "inspect_document",
      description: "Inspect a text, CSV, Excel xlsx, Word docx, or basic PDF file inside the workspace and return readable content or a concise summary.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path to inspect." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_spreadsheet",
      description: "Create a CSV or xlsx spreadsheet file from headers and rows. Use this for reports, split results, tables, or exported data.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Output path such as reports/table.xlsx or table.csv." },
          headers: { type: "array", items: { type: "string" } },
          rows: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        required: ["path", "rows"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "split_spreadsheet",
      description: "Split a CSV/TSV/xlsx spreadsheet into multiple CSV files. Keeps the header row in each output file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative input file path." },
          parts: { type: "number", description: "Number of output parts." },
          rowsPerFile: { type: "number", description: "Alternative chunk size by data rows per output file." },
          outputDir: { type: "string", description: "Relative output directory." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Read basic Windows system status: OS, CPU, memory, and filesystem drive usage. Requires command-enabled permission mode.",
      parameters: {
        type: "object",
        properties: {
          detail: { type: "string", enum: ["basic"], description: "Optional detail level. Only basic is supported." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_processes",
      description: "List top Windows processes by CPU usage. Requires command-enabled permission mode.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum process count, defaults to 12." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "batch_files",
      description: "Copy files in a workspace directory to another directory, or move them only in full-access mode. Useful for organizing project files safely.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["copy", "move"] },
          sourceDir: { type: "string", description: "Relative source directory." },
          outputDir: { type: "string", description: "Relative output directory." },
          extension: { type: "string", description: "Optional extension filter such as .xlsx or .png." }
        },
        required: ["operation", "sourceDir", "outputDir"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search text or regex across files in the workspace using ripgrep.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text or regex pattern to search for." },
          path: { type: "string", description: "Relative directory path. Defaults to the workspace root." },
          fileGlob: { type: "string", description: "Optional glob such as **/*.ts." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a non-destructive PowerShell command in the workspace.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to run." }
        },
        required: ["command"]
      }
    }
  }
];
