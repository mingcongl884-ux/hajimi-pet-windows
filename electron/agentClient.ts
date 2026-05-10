import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import type { ChatApiSettings, ChatResponse } from "./chatClient.js";
import { buildOpenAIChatCompletionsEndpoint } from "./chatClient.js";
import { ChatClientError } from "./chatClient.js";
import type { AgentSettings } from "./settingsStore.js";
import { readPetAction, type PetAction } from "../src/lib/petActions.js";

export type CommandPolicy = {
  enabled: boolean;
  blockDangerousCommands: boolean;
};

type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
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

const MAX_STEPS = 6;
const MAX_TOOL_OUTPUT = 12000;

export async function runAgentTask(
  fetchImpl: FetchLike,
  api: ChatApiSettings,
  agent: AgentSettings,
  task: string
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

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await fetchImpl(buildOpenAIChatCompletionsEndpoint(api.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: api.model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: step === 0 ? "required" : "auto"
      })
    });

    if (!response.ok) {
      throw new ChatClientError(
        "provider-error",
        response.statusText || "Agent provider returned an error.",
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
        petActions: petActions.length ? petActions : undefined
      };
    }

    for (const toolCall of message.tool_calls) {
      const petAction = readPetToolCall(toolCall);
      if (petAction) {
        petActions.push(petAction);
      }
      const result = petAction ? "Pet action accepted." : await executeToolCall(agent, toolCall);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: trimToolOutput(result)
      });
    }
  }

  return {
    role: "assistant",
    content: petActions.length ? "我已经执行了宠物动作。" : "I reached the step limit. I stopped before doing more work.",
    petActions: petActions.length ? petActions : undefined
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

async function executeToolCall(agent: AgentSettings, toolCall: ToolCall): Promise<string> {
  const args = parseToolArguments(toolCall.function.arguments);
  switch (toolCall.function.name) {
    case "list_files":
      return listFiles(agent.workspaceDir, String(args.path ?? "."));
    case "read_file":
      return readTextFile(agent.workspaceDir, String(args.path ?? ""));
    case "search_files":
      return searchFiles(
        agent.workspaceDir,
        String(args.query ?? ""),
        String(args.path ?? "."),
        typeof args.fileGlob === "string" ? args.fileGlob : undefined
      );
    case "write_file":
      return writeTextFile(agent.workspaceDir, String(args.path ?? ""), String(args.content ?? ""));
    case "run_command":
      return runCommand(agent, String(args.command ?? ""));
    default:
      return `Unknown tool: ${toolCall.function.name}`;
  }
}

async function listFiles(workspaceDir: string, relativePath: string): Promise<string> {
  const dir = resolveWorkspacePath(workspaceDir, relativePath);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .slice(0, 200)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n") || "(empty)";
}

async function readTextFile(workspaceDir: string, relativePath: string): Promise<string> {
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

async function writeTextFile(workspaceDir: string, relativePath: string, content: string): Promise<string> {
  const filePath = resolveWorkspacePath(workspaceDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return `Wrote ${relativePath}`;
}

async function runCommand(agent: AgentSettings, command: string): Promise<string> {
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
    "You are not only a text assistant: you have a visible desktop pet body controlled by control_pet. Treat movement requests as requests for your own body.",
    "If the user asks you to jump, move, run, change mood, speak as a bubble, go to a screen edge/corner, play by yourself, review work, wait for a result, or calm down, use control_pet instead of saying you cannot control the GUI.",
    "Use mood=review while reading files or thinking about a work task, mood=waiting while waiting for tool output or a user reply, mood=working for focused office flow, and mood=failed when blocked.",
    "Keep file paths relative to the workspace.",
    "For code or file tasks: inspect relevant files first, make focused edits, run a suitable verification command when available, then summarize the outcome.",
    "Prefer search_files before guessing where code lives. Prefer read_file before write_file.",
    "Explain what you changed or what command output means. Do not claim work is done unless a tool result supports it."
  ].join("\n");
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
        oneOf: [
          {
            properties: {
              type: { const: "say" },
              text: { type: "string", minLength: 1, maxLength: 140 }
            },
            required: ["type", "text"]
          },
          {
            properties: {
              type: { enum: ["jump", "openChat", "stopMovement"] }
            },
            required: ["type"]
          },
          {
            properties: {
              type: { const: "moveToEdge" },
              edge: { enum: ["left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight", "center"] }
            },
            required: ["type", "edge"]
          },
          {
            properties: {
              type: { const: "moveTo" },
              x: { type: "number" },
              y: { type: "number" }
            },
            required: ["type", "x", "y"]
          },
          {
            properties: {
              type: { const: "runAround" },
              seconds: { type: "number", minimum: 1, maximum: 30 }
            },
            required: ["type"]
          },
          {
            properties: {
              type: { const: "setMovement" },
              enabled: { type: "boolean" },
              intensity: { enum: ["calm", "normal", "lively"] }
            },
            required: ["type", "enabled"]
          },
          {
            properties: {
              type: { const: "mood" },
              mood: { enum: ["idle", "happy", "working", "waiting", "review", "failed"] }
            },
            required: ["type", "mood"]
          }
        ]
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
      description: "Write a UTF-8 text file inside the workspace.",
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
