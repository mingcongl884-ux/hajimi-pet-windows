import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import type { AgentPermissionMode } from "./settingsStore.js";
import type { ToolResult } from "./agentClient.js";
import type { RemoteToolName } from "../src/lib/remoteBridge.js";

export type StartRemoteBridgeRelayServerOptions = {
  port?: number;
  bindHost?: string;
  toolTimeoutMs?: number;
};

export type RemoteBridgeRelayServerController = {
  url: string;
  port: number;
  stop(): Promise<void>;
};

type RelayHostRegisterRequest = {
  deviceName?: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  permissionMode?: AgentPermissionMode;
  workspaceReady?: boolean;
};

type RelayHostPollRequest = {
  sessionId?: string;
};

type RelayHostResultRequest = {
  sessionId?: string;
  requestId?: string;
  ok?: boolean;
  result?: ToolResult;
  error?: string;
};

type RelayPairRequest = {
  pairingCode?: string;
  deviceName?: string;
};

type RelayToolRequest = {
  sessionId?: string;
  requestId?: string;
  tool?: RemoteToolName;
  args?: Record<string, unknown>;
};

type RelayMcpRuntime = {
  handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void>;
  close(): Promise<void>;
};

type RemoteBridgeToolInput = {
  path?: string;
  query?: string;
  fileGlob?: string;
  content?: string;
  operation?: "copy" | "move";
  sourceDir?: string;
  outputDir?: string;
  extension?: string;
  headers?: string[];
  rows?: Array<Array<string | number | boolean | null | undefined>>;
  parts?: number;
  rowsPerFile?: number;
  limit?: number;
  appName?: string;
  name?: string;
  command?: string;
  detail?: "basic";
};

type ToolSpec = {
  name: RemoteToolName;
  description: string;
  inputSchema: z.ZodType<RemoteBridgeToolInput>;
};

type RelayClient = {
  id: string;
  name: string;
  token: string;
  pairedAt: string;
};

type QueuedToolCall = {
  type: "tool";
  requestId: string;
  clientId: string;
  clientName: string;
  tool: RemoteToolName;
  args: Record<string, unknown>;
};

type PendingRelayResponse = {
  resolve(result: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
};

type PendingHostPoll = {
  response: ServerResponse;
  timeout: NodeJS.Timeout;
};

type RelaySession = {
  id: string;
  hostSecret: string;
  deviceName: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  permissionMode: AgentPermissionMode;
  workspaceReady: boolean;
  createdAt: string;
  updatedAt: string;
  clients: RelayClient[];
  queue: QueuedToolCall[];
  pendingResponses: Map<string, PendingRelayResponse>;
  pendingPoll?: PendingHostPoll;
};

const DEFAULT_RELAY_PORT = 18041;
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
const TOOL_SPECS: ToolSpec[] = [
  {
    name: "listFiles",
    description: "List files in the remote workspace.",
    inputSchema: z.object({ path: z.string().optional() })
  },
  {
    name: "readFile",
    description: "Read a UTF-8 text file from the remote workspace.",
    inputSchema: z.object({ path: z.string().optional() })
  },
  {
    name: "searchFiles",
    description: "Search text across files in the remote workspace.",
    inputSchema: z.object({
      query: z.string(),
      path: z.string().optional(),
      fileGlob: z.string().optional()
    })
  },
  {
    name: "writeFile",
    description: "Write a UTF-8 text file in the remote workspace.",
    inputSchema: z.object({
      path: z.string().optional(),
      content: z.string().optional()
    })
  },
  {
    name: "batchFiles",
    description: "Copy or move a batch of files inside the remote workspace.",
    inputSchema: z.object({
      operation: z.enum(["copy", "move"]).optional(),
      sourceDir: z.string().optional(),
      outputDir: z.string().optional(),
      extension: z.string().optional()
    })
  },
  {
    name: "inspectDocument",
    description: "Inspect a workspace document and return readable content or a concise summary.",
    inputSchema: z.object({ path: z.string().optional() })
  },
  {
    name: "createSpreadsheet",
    description: "Create a CSV or xlsx spreadsheet file from headers and rows.",
    inputSchema: z.object({
      path: z.string().optional(),
      headers: z.array(z.string()).optional(),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional()
    })
  },
  {
    name: "splitSpreadsheet",
    description: "Split a CSV/TSV/xlsx spreadsheet into multiple CSV files.",
    inputSchema: z.object({
      path: z.string().optional(),
      parts: z.number().optional(),
      rowsPerFile: z.number().optional(),
      outputDir: z.string().optional()
    })
  },
  {
    name: "systemStatus",
    description: "Read basic Windows system status for the remote device.",
    inputSchema: z.object({ detail: z.literal("basic").optional() })
  },
  {
    name: "processList",
    description: "List top Windows processes by CPU usage on the remote device.",
    inputSchema: z.object({ limit: z.number().optional() })
  },
  {
    name: "openApplication",
    description: "Open or launch a local desktop application on the remote device.",
    inputSchema: z.object({
      appName: z.string().optional(),
      name: z.string().optional()
    })
  },
  {
    name: "runCommand",
    description: "Run a non-destructive PowerShell command on the remote device.",
    inputSchema: z.object({ command: z.string().optional() })
  }
];

export async function startRemoteBridgeRelayServer(
  options: StartRemoteBridgeRelayServerOptions = {}
): Promise<RemoteBridgeRelayServerController> {
  const sessions = new Map<string, RelaySession>();
  const mcpRuntime = await startRelayMcpRuntime(sessions, options);
  const server = createServer((request, response) => {
    void handleRelayRequest(sessions, options, mcpRuntime, request, response);
  });
  const bindHost = options.bindHost ?? "0.0.0.0";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? DEFAULT_RELAY_PORT, bindHost, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const visibleHost = bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost;
  return {
    url: `http://${visibleHost}:${address.port}`,
    port: address.port,
    stop: async () => {
      for (const session of sessions.values()) {
        session.pendingPoll && writeJson(session.pendingPoll.response, 200, { type: "idle" });
        clearTimeout(session.pendingPoll?.timeout);
        for (const pending of session.pendingResponses.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Relay server stopped."));
        }
      }
      sessions.clear();
      await mcpRuntime.close();
      await stopServer(server);
    }
  };
}

async function handleRelayRequest(
  sessions: Map<string, RelaySession>,
  options: StartRemoteBridgeRelayServerOptions,
  mcpRuntime: RelayMcpRuntime,
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const url = new URL(request.url ?? "/", "http://relay.local");
    if (request.method === "GET" && url.pathname === "/status") {
      writeJson(response, 200, { status: "ok", sessions: sessions.size });
      return;
    }
    if (request.method === "POST" && url.pathname === "/host/register") {
      await handleHostRegister(sessions, request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/host/poll") {
      await handleHostPoll(sessions, request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/host/result") {
      await handleHostResult(sessions, request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/pair") {
      await handlePair(sessions, request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/tool") {
      await handleTool(sessions, options, request, response);
      return;
    }
    if ((request.method === "POST" || request.method === "GET" || request.method === "DELETE") && url.pathname === "/mcp") {
      await handleMcp(sessions, mcpRuntime, request, response, url);
      return;
    }

    writeText(response, 404, "Not found.");
  } catch (error) {
    writeText(response, 500, error instanceof Error ? error.message : String(error));
  }
}

async function handleHostRegister(
  sessions: Map<string, RelaySession>,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<RelayHostRegisterRequest>(request);
  const now = new Date().toISOString();
  const session: RelaySession = {
    id: randomUUID(),
    hostSecret: randomBytes(24).toString("hex"),
    deviceName: String(body.deviceName || "HaJiMi Host"),
    pairingCode: body.pairingCode,
    pairingExpiresAt: body.pairingExpiresAt,
    permissionMode: readPermissionMode(body.permissionMode),
    workspaceReady: Boolean(body.workspaceReady),
    createdAt: now,
    updatedAt: now,
    clients: [],
    queue: [],
    pendingResponses: new Map()
  };
  sessions.set(session.id, session);
  writeJson(response, 200, {
    sessionId: session.id,
    hostSecret: session.hostSecret,
    status: "connected"
  });
}

async function handleHostPoll(
  sessions: Map<string, RelaySession>,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<RelayHostPollRequest>(request);
  const session = resolveHostSession(sessions, body.sessionId, request.headers.authorization);
  if (!session) {
    writeText(response, 401, "Untrusted relay host.");
    return;
  }

  const next = session.queue.shift();
  if (next) {
    writeJson(response, 200, { type: next.type, request: withoutType(next) });
    return;
  }

  session.pendingPoll && writeJson(session.pendingPoll.response, 200, { type: "idle" });
  clearTimeout(session.pendingPoll?.timeout);
  const timeout = setTimeout(() => {
    if (session.pendingPoll?.response === response) {
      session.pendingPoll = undefined;
      writeJson(response, 200, { type: "idle" });
    }
  }, 25_000);
  session.pendingPoll = { response, timeout };
  request.on("close", () => {
    if (session.pendingPoll?.response === response) {
      clearTimeout(timeout);
      session.pendingPoll = undefined;
    }
  });
}

async function handleHostResult(
  sessions: Map<string, RelaySession>,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<RelayHostResultRequest>(request);
  const session = resolveHostSession(sessions, body.sessionId, request.headers.authorization);
  if (!session || !body.requestId) {
    writeText(response, 401, "Untrusted relay host.");
    return;
  }

  const pending = session.pendingResponses.get(body.requestId);
  if (!pending) {
    writeJson(response, 200, { ok: false, ignored: true });
    return;
  }
  session.pendingResponses.delete(body.requestId);
  clearTimeout(pending.timeout);
  if (body.ok && body.result) {
    pending.resolve(body.result);
  } else {
    pending.reject(new Error(body.error || "Remote relay tool failed."));
  }
  writeJson(response, 200, { ok: true });
}

async function handlePair(
  sessions: Map<string, RelaySession>,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<RelayPairRequest>(request);
  const session = [...sessions.values()].find((item) =>
    item.pairingCode &&
    body.pairingCode === item.pairingCode &&
    (!item.pairingExpiresAt || Date.now() <= Date.parse(item.pairingExpiresAt))
  );
  if (!session) {
    writeText(response, 403, "Invalid or expired relay pairing code.");
    return;
  }

  const client: RelayClient = {
    id: randomUUID(),
    name: String(body.deviceName || "Remote HaJiMi"),
    token: randomBytes(24).toString("hex"),
    pairedAt: new Date().toISOString()
  };
  session.clients.push(client);
  writeJson(response, 200, {
    deviceId: client.id,
    name: session.deviceName,
    token: client.token,
    permissionMode: session.permissionMode,
    transport: "relay",
    relaySessionId: session.id
  });
}

async function handleTool(
  sessions: Map<string, RelaySession>,
  options: StartRemoteBridgeRelayServerOptions,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<RelayToolRequest>(request);
  const session = body.sessionId ? sessions.get(body.sessionId) : undefined;
  const client = resolveRelayClient(session, request.headers.authorization);
  if (!session || !client) {
    writeText(response, 401, "Untrusted relay client.");
    return;
  }
  if (!body.tool) {
    writeText(response, 400, "Missing remote tool name.");
    return;
  }

  try {
    const result = await enqueueToolCall(session, {
      type: "tool",
      requestId: body.requestId || randomUUID(),
      clientId: client.id,
      clientName: client.name,
      tool: body.tool,
      args: body.args ?? {}
    }, options.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);
    writeJson(response, 200, result);
  } catch (error) {
    writeText(response, 504, error instanceof Error ? error.message : String(error));
  }
}

async function handleMcp(
  sessions: Map<string, RelaySession>,
  mcpRuntime: RelayMcpRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
) {
  const sessionId = url.searchParams.get("sessionId") || request.headers["x-hajimi-relay-session-id"]?.toString();
  const session = sessionId ? sessions.get(sessionId) : undefined;
  const client = resolveRelayClient(session, request.headers.authorization);
  if (!session || !client) {
    writeText(response, 401, "Untrusted relay client.");
    return;
  }

  (request as IncomingMessage & { auth?: AuthInfo }).auth = {
    token: client.token,
    clientId: client.id,
    scopes: [session.permissionMode],
    extra: {
      relaySessionId: session.id,
      clientId: client.id,
      clientName: client.name
    }
  };
  await mcpRuntime.handleRequest(request as IncomingMessage & { auth?: AuthInfo }, response);
}

function enqueueToolCall(session: RelaySession, call: QueuedToolCall, timeoutMs: number): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingResponses.delete(call.requestId);
      reject(new Error("Remote relay host did not return a result in time."));
    }, timeoutMs);
    session.pendingResponses.set(call.requestId, { resolve, reject, timeout });
    if (session.pendingPoll) {
      const pendingPoll = session.pendingPoll;
      session.pendingPoll = undefined;
      clearTimeout(pendingPoll.timeout);
      writeJson(pendingPoll.response, 200, { type: call.type, request: withoutType(call) });
      return;
    }
    session.queue.push(call);
  });
}

function resolveHostSession(
  sessions: Map<string, RelaySession>,
  sessionId: string | undefined,
  authorization: string | undefined
): RelaySession | undefined {
  const session = sessionId ? sessions.get(sessionId) : undefined;
  return session?.hostSecret === readBearerToken(authorization) ? session : undefined;
}

function resolveRelayClient(session: RelaySession | undefined, authorization: string | undefined): RelayClient | undefined {
  const token = readBearerToken(authorization);
  return session?.clients.find((client) => client.token === token);
}

async function startRelayMcpRuntime(
  sessions: Map<string, RelaySession>,
  options: StartRemoteBridgeRelayServerOptions
): Promise<RelayMcpRuntime> {
  const server = new McpServer(
    {
      name: "hajimi-remote-relay",
      version: "1.0.0"
    },
    { capabilities: { logging: {} } }
  );

  for (const spec of TOOL_SPECS) {
    server.registerTool(
      spec.name,
      {
        description: spec.description,
        inputSchema: spec.inputSchema
      },
      async (args, extra) => {
        const auth = readRelayMcpAuth(extra.authInfo);
        const session = sessions.get(auth.relaySessionId ?? "");
        if (!session) {
          throw new Error("Relay session is not available.");
        }

        const result = await enqueueToolCall(session, {
          type: "tool",
          requestId: extra.requestId?.toString() || randomUUID(),
          clientId: auth.clientId || "mcp-client",
          clientName: auth.clientName || "MCP Client",
          tool: spec.name,
          args: args as Record<string, unknown>
        }, options.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);
        return toMcpToolResult(result);
      }
    );
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });
  await server.connect(transport);

  return {
    handleRequest(request, response) {
      return transport.handleRequest(request as IncomingMessage & { auth?: AuthInfo }, response);
    },
    async close() {
      await transport.close();
      await server.close();
    }
  };
}

function readRelayMcpAuth(authInfo: AuthInfo | undefined): {
  relaySessionId?: string;
  clientId?: string;
  clientName?: string;
} {
  const extra = authInfo?.extra ?? {};
  return {
    relaySessionId: typeof extra.relaySessionId === "string" ? extra.relaySessionId : undefined,
    clientId: typeof extra.clientId === "string" ? extra.clientId : undefined,
    clientName: typeof extra.clientName === "string" ? extra.clientName : undefined
  };
}

function toMcpToolResult(result: ToolResult) {
  const lines = [result.content.trim()];
  if (result.fileOutput) {
    lines.push(formatFileOutput(result.fileOutput));
  }
  if (result.fileOutputs?.length) {
    lines.push("Files:");
    lines.push(...result.fileOutputs.map(formatFileOutput));
  }
  return {
    content: [
      {
        type: "text" as const,
        text: lines.filter(Boolean).join("\n").trim()
      }
    ]
  };
}

function formatFileOutput(fileOutput: { path: string; name: string; size?: number }): string {
  return fileOutput.size ? `${fileOutput.path} (${fileOutput.size} bytes)` : fileOutput.path;
}

function withoutType(call: QueuedToolCall): Omit<QueuedToolCall, "type"> {
  const { type: _type, ...rest } = call;
  return rest;
}

function readPermissionMode(value: AgentPermissionMode | undefined): AgentPermissionMode {
  return value === "auto-review" || value === "full-access" ? value : "default";
}

function readBearerToken(value: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(value ?? "");
  return match?.[1] ?? "";
}

function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) as T : {} as T);
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  response.end(json);
}

function writeText(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || process.argv[2] || DEFAULT_RELAY_PORT);
  const host = process.env.HOST || "0.0.0.0";
  const server = await startRemoteBridgeRelayServer({ port, bindHost: host });
  console.log(`HaJiMi relay listening on ${server.url}`);
}
