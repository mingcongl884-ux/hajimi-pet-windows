import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentPermissionMode } from "./settingsStore.js";
import { executeRemoteBridgeTool } from "./remoteBridgeTools.js";
import { startRemoteBridgeMcpRuntime, type RemoteBridgeAuditEvent, type RemoteBridgeMcpRuntime } from "./remoteBridgeMcp.js";
import type { RemoteToolName, RemoteTrustedDevice } from "../src/lib/remoteBridge.js";

export type StartRemoteBridgeHostOptions = {
  port: number;
  bindHost?: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  workspaceDir: string;
  permissionMode: AgentPermissionMode;
  trustedDevices: RemoteTrustedDevice[];
  onTrustDevice(device: RemoteTrustedDevice): Promise<RemoteTrustedDevice>;
  onAudit(event: RemoteBridgeAuditEvent): Promise<void>;
};

export type RemoteBridgeHostController = {
  url: string;
  port: number;
  stop(): Promise<void>;
};

type PairRequest = {
  pairingCode?: string;
  deviceName?: string;
};

type ToolRequest = {
  requestId?: string;
  tool?: RemoteToolName;
  args?: Record<string, unknown>;
};

export async function startRemoteBridgeHost(options: StartRemoteBridgeHostOptions): Promise<RemoteBridgeHostController> {
  const mcpRuntime = await startRemoteBridgeMcpRuntime({
    workspaceDir: options.workspaceDir,
    permissionMode: options.permissionMode,
    trustedDevices: options.trustedDevices,
    onAudit: options.onAudit
  });
  const server = createServer((request, response) => {
    void handleRequest(options, mcpRuntime, request, response);
  });
  const bindHost = options.bindHost ?? "0.0.0.0";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, bindHost, () => {
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
      await mcpRuntime.close();
      await stopServer(server);
    }
  };
}

async function handleRequest(
  options: StartRemoteBridgeHostOptions,
  mcpRuntime: RemoteBridgeMcpRuntime,
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    if (request.method === "GET" && request.url === "/status") {
      writeJson(response, 200, {
        status: "listening",
        deviceName: "HaJiMi Host",
        workspaceReady: Boolean(options.workspaceDir.trim())
      });
      return;
    }

    if (request.method === "POST" && request.url === "/pair") {
      await handlePair(options, request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/tool") {
      await handleTool(options, request, response);
      return;
    }

    if (request.url === "/mcp") {
      await mcpRuntime.handleRequest(request, response);
      return;
    }

    writeText(response, 404, "Not found.");
  } catch (error) {
    await options.onAudit({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString()
    });
    writeText(response, 500, error instanceof Error ? error.message : String(error));
  }
}

async function handlePair(
  options: StartRemoteBridgeHostOptions,
  request: IncomingMessage,
  response: ServerResponse
) {
  const body = await readJsonBody<PairRequest>(request);
  if (!options.pairingCode || body.pairingCode !== options.pairingCode) {
    writeText(response, 403, "Invalid pairing code.");
    return;
  }
  if (options.pairingExpiresAt && Date.now() > Date.parse(options.pairingExpiresAt)) {
    writeText(response, 410, "Pairing code expired.");
    return;
  }

  const now = new Date().toISOString();
  const device: RemoteTrustedDevice = {
    id: randomUUID(),
    name: String(body.deviceName || "Remote HaJiMi"),
    token: randomBytes(24).toString("hex"),
    permissionMode: options.permissionMode,
    allowedWorkspace: options.workspaceDir,
    pairedAt: now,
    lastSeenAt: now
  };
  const trusted = await options.onTrustDevice(device);
  await options.onAudit({
    type: "pair",
    deviceId: trusted.id,
    deviceName: trusted.name,
    message: `Paired ${trusted.name}`,
    at: now
  });
  writeJson(response, 200, {
    deviceId: trusted.id,
    name: trusted.name,
    token: trusted.token,
    permissionMode: trusted.permissionMode
  });
}

async function handleTool(
  options: StartRemoteBridgeHostOptions,
  request: IncomingMessage,
  response: ServerResponse
) {
  const token = readBearerToken(request.headers.authorization);
  const trusted = options.trustedDevices.find((device) => device.token === token && !device.revokedAt);
  if (!trusted) {
    await options.onAudit({
      type: "denied",
      message: "Rejected remote tool call from an untrusted token.",
      at: new Date().toISOString()
    });
    writeText(response, 401, "Untrusted remote device.");
    return;
  }

  const body = await readJsonBody<ToolRequest>(request);
  if (!body.tool) {
    writeText(response, 400, "Missing remote tool name.");
    return;
  }

  const result = await executeRemoteBridgeTool({
    workspaceDir: trusted.allowedWorkspace || options.workspaceDir,
    permissionMode: trusted.permissionMode,
    tool: body.tool,
    args: body.args ?? {}
  });
  await options.onAudit({
    type: "tool",
    deviceId: trusted.id,
    deviceName: trusted.name,
    requestId: body.requestId,
    tool: body.tool,
    message: `Executed ${body.tool}`,
    at: new Date().toISOString()
  });
  writeJson(response, 200, result);
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
