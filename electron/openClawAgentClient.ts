import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ChatApiSettings, ChatResponse } from "./chatClient.js";
import { ChatClientError } from "./chatClient.js";
import type { AgentSettings } from "./settingsStore.js";

const require = createRequire(import.meta.url);
const OPENCLAW_API_KEY_ENV = "HAJIMI_OPENCLAW_API_KEY";
const OPENCLAW_AGENT_ID = "hajimi";

type SpawnedProcess = {
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
  kill(): unknown;
};

type SpawnImpl = (command: string, args: string[], options: {
  env: NodeJS.ProcessEnv;
  windowsHide: boolean;
}) => SpawnedProcess;

type OpenClawConfig = {
  agents: {
    defaults: {
      workspace: string;
      model: {
        primary: string;
      };
      systemPromptOverride: string;
      sandbox: {
        mode: "off";
      };
      timeoutSeconds: number;
    };
    list: Array<{
      id: string;
      workspace: string;
      model: {
        primary: string;
      };
      systemPromptOverride: string;
      sandbox: {
        mode: "off";
      };
    }>;
  };
  tools: {
    profile: "coding" | "full";
    deny?: string[];
    elevated: {
      enabled: boolean;
    };
  };
  models: {
    mode: "merge";
    providers: Record<string, {
      baseUrl: string;
      api: "openai-completions";
      apiKey: string;
      request?: {
        allowPrivateNetwork: boolean;
      };
      models: Array<{
        id: string;
        name: string;
        input: ["text"];
        reasoning: boolean;
        contextWindow: number;
        maxTokens: number;
        compat: {
          requiresStringContent: boolean;
        };
      }>;
    }>;
  };
};

type RunOpenClawAgentOptions = {
  stateDir?: string;
  nodeRuntime?: string;
  openClawCli?: string;
  spawnImpl?: SpawnImpl;
  signal?: AbortSignal;
};

export async function runOpenClawAgentTask(
  api: ChatApiSettings,
  agent: AgentSettings,
  task: string,
  options: RunOpenClawAgentOptions = {}
): Promise<ChatResponse> {
  if (!api.apiKey.trim()) {
    throw new ChatClientError("missing-api-key", "API key is required.");
  }
  if (!agent.workspaceDir.trim()) {
    throw new ChatClientError("malformed-response", "Choose a workspace before using work mode.");
  }

  const stateDir = options.stateDir ?? join(defaultUserDataDir(), "openclaw-office");
  await mkdir(stateDir, { recursive: true });
  const configPath = join(stateDir, "openclaw.json");
  await writeFile(configPath, `${JSON.stringify(buildOpenClawConfig(api, agent), null, 2)}\n`, "utf8");

  const cliPath = options.openClawCli ?? resolveBundledOpenClawCli();
  if (!cliPath) {
    throw new ChatClientError("provider-error", "Bundled OpenClaw runtime was not found.");
  }

  const sessionId = buildSessionId(agent.workspaceDir, api.model);
  const result = await runOpenClawCli({
    command: options.nodeRuntime ?? resolveNodeRuntime(),
    args: [
      cliPath,
      "agent",
      "--local",
      "--json",
      "--agent",
      OPENCLAW_AGENT_ID,
      "--session-id",
      sessionId,
      "--message",
      task,
      "--timeout",
      "600"
    ],
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      [OPENCLAW_API_KEY_ENV]: api.apiKey
    },
    spawnImpl: options.spawnImpl ?? spawn,
    signal: options.signal,
    timeoutMs: 610_000
  });

  if (result.code !== 0) {
    throw new ChatClientError(
      "provider-error",
      result.output || `OpenClaw exited with code ${result.code ?? "unknown"}.`,
      result.code ?? undefined
    );
  }

  return parseOpenClawAgentOutput(result.output);
}

export function buildOpenClawConfig(api: ChatApiSettings, agent: AgentSettings): OpenClawConfig {
  const providerId = "hajimi-default";
  const modelId = api.model.trim();
  const modelRef = `${providerId}/${modelId}`;
  const systemPrompt = [
    api.systemPrompt.trim() || "You are HaJiMi, a friendly desktop pet office agent.",
    "You are running inside HaJiMi ordinary office mode through OpenClaw.",
    "When useful, handle real workspace tasks with available file, runtime, and session tools.",
    "Reply in the user's language unless the task asks otherwise."
  ].join("\n");
  const fullAccess = agent.permissionMode === "full-access";
  const defaultMode = agent.permissionMode === "default" && !agent.allowCommands;

  return {
    agents: {
      defaults: {
        workspace: agent.workspaceDir,
        model: { primary: modelRef },
        systemPromptOverride: systemPrompt,
        sandbox: { mode: "off" },
        timeoutSeconds: 600
      },
      list: [{
        id: OPENCLAW_AGENT_ID,
        workspace: agent.workspaceDir,
        model: { primary: modelRef },
        systemPromptOverride: systemPrompt,
        sandbox: { mode: "off" }
      }]
    },
    tools: {
      profile: fullAccess ? "full" : "coding",
      ...(defaultMode ? { deny: ["write", "edit", "apply_patch", "exec", "process", "browser", "canvas"] } : {}),
      elevated: { enabled: fullAccess }
    },
    models: {
      mode: "merge",
      providers: {
        [providerId]: {
          baseUrl: normalizeOpenAICompatibleBaseUrl(api.baseUrl),
          api: "openai-completions",
          apiKey: OPENCLAW_API_KEY_ENV,
          request: {
            allowPrivateNetwork: true
          },
          models: [{
            id: modelId,
            name: modelId,
            input: ["text"],
            reasoning: /reason|think|r1|pro|deep|claude|gpt-5|o\d/i.test(modelId),
            contextWindow: 262144,
            maxTokens: 32000,
            compat: {
              requiresStringContent: true
            }
          }]
        }
      }
    }
  };
}

export function parseOpenClawAgentOutput(output: string): ChatResponse {
  const parsed = parseJsonFromOutput(output);
  const content = extractAssistantContent(parsed).trim();
  return {
    role: "assistant",
    content: content || "OpenClaw finished without a text reply."
  };
}

function runOpenClawCli(params: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  spawnImpl: SpawnImpl;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = params.spawnImpl(params.command, params.args, {
      env: params.env,
      windowsHide: true
    });
    let output = "";
    let settled = false;
    const finish = (code: number | null, extra = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      params.signal?.removeEventListener("abort", abort);
      resolve({ code, output: `${output}${extra}`.trim() });
    };
    const abort = () => {
      child.kill();
      finish(null, "\nOpenClaw task was cancelled.");
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(null, "\nOpenClaw task timed out.");
    }, params.timeoutMs);

    params.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      finish(null, error.message);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}

function normalizeOpenAICompatibleBaseUrl(value: string): string {
  const url = new URL(value.trim() || "https://api.openai.com");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, "");
  url.pathname = url.pathname.replace(/\/+$/u, "");
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/v1";
  }
  return url.toString().replace(/\/$/u, "");
}

function parseJsonFromOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // OpenClaw keeps stdout clean in JSON mode, but older plugins may still log.
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== "{") {
      continue;
    }
    const candidate = readJsonObjectAt(trimmed, index);
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return { content: trimmed };
}

function readJsonObjectAt(value: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }
  return undefined;
}

function extractAssistantContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const key of ["content", "text", "reply", "message"]) {
    if (typeof record[key] === "string") {
      return record[key] as string;
    }
  }
  if (Array.isArray(record.payloads)) {
    return record.payloads.map(extractAssistantContent).filter(Boolean).join("\n\n");
  }
  if (record.final) {
    return extractAssistantContent(record.final);
  }
  if (record.result) {
    return extractAssistantContent(record.result);
  }
  return "";
}

function buildSessionId(workspaceDir: string, model: string): string {
  const hash = createHash("sha256").update(`${workspaceDir}\n${model}`).digest("hex").slice(0, 16);
  return `hajimi-${hash}`;
}

function defaultUserDataDir(): string {
  const appData = process.env.APPDATA ?? process.env.LOCALAPPDATA ?? process.cwd();
  return join(appData, "xiaomi-pet-windows");
}

export function resolveBundledOpenClawCli(): string | undefined {
  return findFirstExistingPath(resolveBundledNodeModulesRoots().map((root) => join(root, "openclaw", "openclaw.mjs")))
    ?? resolvePackagePath("openclaw/openclaw.mjs");
}

function resolveNodeRuntime(): string {
  return resolveBundledNodeRuntime() ?? "node";
}

function resolveBundledNodeRuntime(): string | undefined {
  const nodeRoot = resolveBundledPackageRoot("node/package.json");
  if (!nodeRoot) {
    return undefined;
  }
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const candidate = normalizeAsarUnpackedPath(join(nodeRoot, "bin", executableName));
  return existsSync(candidate) ? candidate : undefined;
}

function resolveBundledPackageRoot(packageJsonPath: string): string | undefined {
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

function resolveBundledNodeModulesRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    roots.push(join(resourcesPath, "app.asar.unpacked", "node_modules"));
  }
  roots.push(join(normalizeAsarUnpackedPath(process.cwd()), "node_modules"));
  roots.push(join(process.cwd(), "node_modules"));
  return [...new Set(roots)];
}

function findFirstExistingPath(paths: string[]): string | undefined {
  return paths.find((candidate) => existsSync(candidate));
}

function normalizeAsarUnpackedPath(value: string): string {
  return value.replace(/\.asar(?=([\\/]|$))/, ".asar.unpacked");
}
