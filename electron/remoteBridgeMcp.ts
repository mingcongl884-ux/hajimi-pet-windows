import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import type { AgentPermissionMode } from "./settingsStore.js";
import { executeRemoteBridgeTool } from "./remoteBridgeTools.js";
import type { RemoteToolName, RemoteTrustedDevice } from "../src/lib/remoteBridge.js";

export type RemoteBridgeAuditEvent = {
  type: "pair" | "tool" | "denied" | "error";
  deviceId?: string;
  deviceName?: string;
  requestId?: string;
  tool?: string;
  message: string;
  at: string;
};

export type StartRemoteBridgeMcpOptions = {
  workspaceDir: string;
  permissionMode: AgentPermissionMode;
  trustedDevices: RemoteTrustedDevice[];
  onAudit(event: RemoteBridgeAuditEvent): Promise<void>;
};

export type RemoteBridgeMcpRuntime = {
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

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "listFiles",
    description: "List files in the remote workspace.",
    inputSchema: z.object({
      path: z.string().optional()
    })
  },
  {
    name: "readFile",
    description: "Read a UTF-8 text file from the remote workspace.",
    inputSchema: z.object({
      path: z.string().optional()
    })
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
    inputSchema: z.object({
      path: z.string().optional()
    })
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
    inputSchema: z.object({
      detail: z.literal("basic").optional()
    })
  },
  {
    name: "processList",
    description: "List top Windows processes by CPU usage on the remote device.",
    inputSchema: z.object({
      limit: z.number().optional()
    })
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
    inputSchema: z.object({
      command: z.string().optional()
    })
  }
];

export async function startRemoteBridgeMcpRuntime(options: StartRemoteBridgeMcpOptions): Promise<RemoteBridgeMcpRuntime> {
  const server = new McpServer(
    {
      name: "hajimi-remote-bridge",
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
        const auth = readMcpAuthExtra(extra.authInfo);
        const result = await executeRemoteBridgeTool({
          workspaceDir: auth.workspaceDir || options.workspaceDir,
          permissionMode: auth.permissionMode || options.permissionMode,
          tool: spec.name,
          args: args as Record<string, unknown>
        });
        await options.onAudit({
          type: "tool",
          deviceId: auth.deviceId,
          deviceName: auth.deviceName,
          requestId: extra.requestId?.toString(),
          tool: spec.name,
          message: `Executed ${spec.name}`,
          at: new Date().toISOString()
        });
        return toMcpToolResult(result);
      }
    );
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });
  await server.connect(transport);

  return {
    async handleRequest(request, response) {
      const trusted = resolveTrustedDevice(request.headers.authorization, options.trustedDevices);
      if (!trusted) {
        await options.onAudit({
          type: "denied",
          message: "Rejected remote MCP request from an untrusted token.",
          at: new Date().toISOString()
        });
        writeText(response, 401, "Untrusted remote device.");
        return;
      }

      (request as IncomingMessage & { auth?: AuthInfo }).auth = {
        token: trusted.token,
        clientId: trusted.id,
        scopes: [trusted.permissionMode],
        extra: {
          deviceId: trusted.id,
          deviceName: trusted.name,
          permissionMode: trusted.permissionMode,
          workspaceDir: trusted.allowedWorkspace || options.workspaceDir
        }
      };
      await transport.handleRequest(request as IncomingMessage & { auth?: AuthInfo }, response);
    },
    async close() {
      await transport.close();
      await server.close();
    }
  };
}

function resolveTrustedDevice(
  authorization: string | undefined,
  trustedDevices: RemoteTrustedDevice[]
): RemoteTrustedDevice | undefined {
  const token = readBearerToken(authorization);
  return trustedDevices.find((device) => device.token === token && !device.revokedAt);
}

function readMcpAuthExtra(authInfo: AuthInfo | undefined): {
  deviceId?: string;
  deviceName?: string;
  workspaceDir?: string;
  permissionMode?: AgentPermissionMode;
} {
  const extra = authInfo?.extra ?? {};
  const permissionMode = extra.permissionMode;
  return {
    deviceId: typeof extra.deviceId === "string" ? extra.deviceId : undefined,
    deviceName: typeof extra.deviceName === "string" ? extra.deviceName : undefined,
    workspaceDir: typeof extra.workspaceDir === "string" ? extra.workspaceDir : undefined,
    permissionMode: permissionMode === "default" || permissionMode === "auto-review" || permissionMode === "full-access"
      ? permissionMode
      : undefined
  };
}

function readBearerToken(value: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(value ?? "");
  return match?.[1] ?? "";
}

function toMcpToolResult(result: { content: string; fileOutput?: { path: string; name: string; size?: number }; fileOutputs?: Array<{ path: string; name: string; size?: number }> }) {
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

function writeText(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}
