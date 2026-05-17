import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startRemoteBridgeHost, type RemoteBridgeHostController } from "../electron/remoteBridgeHost";
import type { RemoteTrustedDevice } from "../src/lib/remoteBridge";

let host: RemoteBridgeHostController | undefined;

afterEach(async () => {
  await host?.stop();
  host = undefined;
});

describe("remote bridge MCP", () => {
  it("authenticates paired devices and exposes tools over MCP", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-mcp-"));
    await writeFile(join(workspace, "README.md"), "mcp bridge reached", "utf8");
    const trustedDevices: RemoteTrustedDevice[] = [];

    host = await startRemoteBridgeHost({
      port: 0,
      pairingCode: "123456",
      pairingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceDir: workspace,
      permissionMode: "default",
      trustedDevices,
      onTrustDevice: async (device) => {
        trustedDevices.push(device);
        return device;
      },
      onAudit: async () => undefined
    });

    const pair = await fetch(`${host.url}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: "123456", deviceName: "Laptop B" })
    }).then((response) => response.json()) as { token: string };

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${host.url}/mcp`), {
      requestInit: {
        headers: {
          authorization: `Bearer ${pair.token}`
        }
      }
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

      expect(text).toContain("mcp bridge reached");
    } finally {
      await transport.close();
    }
  });
});
