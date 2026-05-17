import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildRemoteBridgeHttpMcpServerConfig, callRemoteBridgeTool, pairRemoteBridgeHost } from "../electron/remoteBridgeClient";
import { startRemoteBridgeRelayHost, type RemoteBridgeRelayHostController } from "../electron/remoteBridgeRelayHost";
import { startRemoteBridgeRelayServer, type RemoteBridgeRelayServerController } from "../electron/remoteBridgeRelayServer";

describe("remote bridge relay", () => {
  const servers: RemoteBridgeRelayServerController[] = [];
  const hosts: RemoteBridgeRelayHostController[] = [];

  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((host) => host.stop()));
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });

  it("pairs through a cloud relay and executes a remote tool on the host", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-relay-host-"));
    await mkdir(join(workspace, "docs"), { recursive: true });
    await writeFile(join(workspace, "docs", "note.txt"), "relay hello", "utf8");

    const server = await startRemoteBridgeRelayServer({ port: 0 });
    servers.push(server);

    const host = await startRemoteBridgeRelayHost({
      relayUrl: server.url,
      deviceName: "Office PC",
      pairingCode: "246810",
      pairingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceDir: workspace,
      permissionMode: "full-access",
      onAudit: async () => undefined
    });
    hosts.push(host);

    const paired = await pairRemoteBridgeHost(server.url, "246810", "Travel Laptop");
    expect(paired).toEqual(expect.objectContaining({
      name: "Office PC",
      transport: "relay",
      relaySessionId: host.sessionId,
      permissionMode: "full-access"
    }));

    const result = await callRemoteBridgeTool(paired, {
      tool: "readFile",
      args: { path: "docs/note.txt" }
    });

    expect(result.content).toContain("relay hello");
  });

  it("proxies MCP tool calls through the cloud relay", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-relay-mcp-host-"));
    await writeFile(join(workspace, "README.md"), "relay mcp reached", "utf8");

    const server = await startRemoteBridgeRelayServer({ port: 0 });
    servers.push(server);

    const host = await startRemoteBridgeRelayHost({
      relayUrl: server.url,
      deviceName: "Office PC",
      pairingCode: "135790",
      pairingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceDir: workspace,
      permissionMode: "full-access",
      onAudit: async () => undefined
    });
    hosts.push(host);

    const paired = await pairRemoteBridgeHost(server.url, "135790", "Travel Laptop");
    const config = buildRemoteBridgeHttpMcpServerConfig(paired);
    const client = new Client({ name: "relay-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: config.headers }
    });

    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("readFile");

      const result = await client.callTool({
        name: "readFile",
        arguments: { path: "README.md" }
      });
      const text = result.content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("\n");

      expect(text).toContain("relay mcp reached");
    } finally {
      await transport.close();
    }
  });
});
