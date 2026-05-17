import type { ToolResult } from "./agentClient.js";
import type { RemoteKnownHost, RemoteToolName } from "../src/lib/remoteBridge.js";

export type RemoteBridgeToolRequest = {
  requestId?: string;
  tool: RemoteToolName;
  args: Record<string, unknown>;
};

export type RemoteBridgeHttpMcpServerConfig = {
  type: "http";
  url: string;
  headers: Record<string, string>;
  alwaysLoad: true;
};

export type RemoteBridgeOpenClawMcpServerConfig = {
  url: string;
  transport: "streamable-http";
  headers: Record<string, string>;
};

export async function pairRemoteBridgeHost(
  address: string,
  pairingCode: string,
  deviceName: string,
  fetchImpl: typeof fetch = fetch
): Promise<RemoteKnownHost> {
  const response = await fetchImpl(joinUrl(address, "/pair"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairingCode, deviceName })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to pair with remote host."));
  }

  const payload = await response.json() as {
    deviceId: string;
    name: string;
    token: string;
    permissionMode: RemoteKnownHost["permissionMode"];
    transport?: RemoteKnownHost["transport"];
    relaySessionId?: string;
  };
  return {
    id: payload.deviceId,
    name: payload.name,
    address: normalizeRemoteBridgeAddress(address),
    token: payload.token,
    permissionMode: payload.permissionMode,
    transport: payload.transport ?? "http",
    relaySessionId: payload.relaySessionId
  };
}

export async function callRemoteBridgeTool(
  host: RemoteKnownHost,
  request: RemoteBridgeToolRequest,
  fetchImpl: typeof fetch = fetch
): Promise<ToolResult> {
  const response = await fetchImpl(joinUrl(host.address, "/tool"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${host.token}`
    },
    body: JSON.stringify({
      sessionId: host.relaySessionId,
      requestId: request.requestId,
      tool: request.tool,
      args: request.args
    })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Remote tool call failed: ${request.tool}`));
  }
  return await response.json() as ToolResult;
}

export function buildRemoteBridgeHttpMcpServerConfig(host: RemoteKnownHost): RemoteBridgeHttpMcpServerConfig {
  return {
    type: "http",
    url: buildRemoteBridgeMcpUrl(host),
    headers: {
      authorization: `Bearer ${host.token}`
    },
    alwaysLoad: true
  };
}

export function buildRemoteBridgeOpenClawMcpServerConfig(host: RemoteKnownHost): RemoteBridgeOpenClawMcpServerConfig {
  return {
    url: buildRemoteBridgeMcpUrl(host),
    transport: "streamable-http",
    headers: {
      authorization: `Bearer ${host.token}`
    }
  };
}

export function normalizeRemoteBridgeAddress(address: string): string {
  return new URL(address.trim()).toString().replace(/\/$/u, "");
}

function joinUrl(base: string, path: string): string {
  const url = new URL(base.trim());
  url.pathname = `${url.pathname.replace(/\/$/u, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function buildRemoteBridgeMcpUrl(host: RemoteKnownHost): string {
  const url = new URL(joinUrl(host.address, "/mcp"));
  if (host.transport === "relay" && host.relaySessionId) {
    url.searchParams.set("sessionId", host.relaySessionId);
  }
  return url.toString().replace(/\/$/u, "");
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const raw = await response.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: unknown }; message?: unknown };
      const message = parsed.error?.message ?? parsed.message;
      return typeof message === "string" ? message : `${fallback}: ${trimmed.slice(0, 300)}`;
    } catch {
      return `${fallback}: ${trimmed.slice(0, 300)}`;
    }
  } catch {
    return fallback;
  }
}
