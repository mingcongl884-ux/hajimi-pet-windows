import type { AgentPermissionMode } from "./settingsStore.js";
import { executeRemoteBridgeTool } from "./remoteBridgeTools.js";
import type { RemoteBridgeAuditEvent } from "./remoteBridgeMcp.js";
import type { RemoteToolName } from "../src/lib/remoteBridge.js";

export type StartRemoteBridgeRelayHostOptions = {
  relayUrl: string;
  deviceName: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  workspaceDir: string;
  permissionMode: AgentPermissionMode;
  fetchImpl?: typeof fetch;
  onAudit(event: RemoteBridgeAuditEvent): Promise<void>;
};

export type RemoteBridgeRelayHostController = {
  sessionId: string;
  stop(): Promise<void>;
};

type RelayRegisterResponse = {
  sessionId: string;
  hostSecret: string;
};

type RelayPollResponse =
  | { type: "idle" }
  | {
    type: "tool";
    request: RelayToolPollRequest;
  };

type RelayToolPollRequest = {
  requestId: string;
  clientId?: string;
  clientName?: string;
  tool: RemoteToolName;
  args?: Record<string, unknown>;
};

export async function startRemoteBridgeRelayHost(
  options: StartRemoteBridgeRelayHostOptions
): Promise<RemoteBridgeRelayHostController> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registerResponse = await fetchImpl(joinRelayUrl(options.relayUrl, "/host/register"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceName: options.deviceName,
      pairingCode: options.pairingCode,
      pairingExpiresAt: options.pairingExpiresAt,
      permissionMode: options.permissionMode,
      workspaceReady: Boolean(options.workspaceDir.trim())
    })
  });
  if (!registerResponse.ok) {
    throw new Error(await registerResponse.text());
  }

  const registered = await registerResponse.json() as RelayRegisterResponse;
  const abortController = new AbortController();
  let stopped = false;
  const pollPromise = pollRelayHost({
    ...options,
    fetchImpl,
    sessionId: registered.sessionId,
    hostSecret: registered.hostSecret,
    abortController,
    isStopped: () => stopped
  });

  return {
    sessionId: registered.sessionId,
    async stop() {
      stopped = true;
      abortController.abort();
      await pollPromise.catch(() => undefined);
    }
  };
}

async function pollRelayHost(options: StartRemoteBridgeRelayHostOptions & {
  fetchImpl: typeof fetch;
  sessionId: string;
  hostSecret: string;
  abortController: AbortController;
  isStopped(): boolean;
}) {
  while (!options.isStopped()) {
    try {
      const response = await options.fetchImpl(joinRelayUrl(options.relayUrl, "/host/poll"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.hostSecret}`
        },
        body: JSON.stringify({ sessionId: options.sessionId }),
        signal: options.abortController.signal
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json() as RelayPollResponse;
      if (payload.type === "tool") {
        await runAndPostToolResult(options, payload.request);
      }
    } catch (error) {
      if (options.isStopped() || options.abortController.signal.aborted) {
        return;
      }
      await options.onAudit({
        type: "error",
        message: `Relay poll failed: ${error instanceof Error ? error.message : String(error)}`,
        at: new Date().toISOString()
      });
      await delay(1_500);
    }
  }
}

async function runAndPostToolResult(
  options: StartRemoteBridgeRelayHostOptions & {
    fetchImpl: typeof fetch;
    sessionId: string;
    hostSecret: string;
    abortController: AbortController;
  },
  request: RelayToolPollRequest
) {
  try {
    const result = await executeRemoteBridgeTool({
      workspaceDir: options.workspaceDir,
      permissionMode: options.permissionMode,
      tool: request.tool,
      args: request.args ?? {}
    });
    await options.onAudit({
      type: "tool",
      deviceId: request.clientId,
      deviceName: request.clientName,
      requestId: request.requestId,
      tool: request.tool,
      message: `Relay executed ${request.tool}`,
      at: new Date().toISOString()
    });
    await postRelayResult(options, request.requestId, true, result);
  } catch (error) {
    await options.onAudit({
      type: "error",
      deviceId: request.clientId,
      deviceName: request.clientName,
      requestId: request.requestId,
      tool: request.tool,
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString()
    });
    await postRelayResult(options, request.requestId, false, undefined, error instanceof Error ? error.message : String(error));
  }
}

async function postRelayResult(
  options: {
    relayUrl: string;
    fetchImpl: typeof fetch;
    sessionId: string;
    hostSecret: string;
    abortController: AbortController;
  },
  requestId: string,
  ok: boolean,
  result?: unknown,
  error?: string
) {
  await options.fetchImpl(joinRelayUrl(options.relayUrl, "/host/result"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.hostSecret}`
    },
    body: JSON.stringify({
      sessionId: options.sessionId,
      requestId,
      ok,
      result,
      error
    }),
    signal: options.abortController.signal
  });
}

function joinRelayUrl(base: string, path: string): string {
  const url = new URL(base.trim());
  url.pathname = `${url.pathname.replace(/\/$/u, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
