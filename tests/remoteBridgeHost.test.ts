import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startRemoteBridgeHost, type RemoteBridgeHostController } from "../electron/remoteBridgeHost";
import type { RemoteTrustedDevice } from "../src/lib/remoteBridge";

let host: RemoteBridgeHostController | undefined;

afterEach(async () => {
  await host?.stop();
  host = undefined;
});

describe("remote bridge host", () => {
  it("pairs and executes a trusted read tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-host-"));
    await writeFile(join(workspace, "README.md"), "from host", "utf8");
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
    }).then((response) => response.json()) as { token: string; deviceId: string };

    const result = await fetch(`${host.url}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pair.token}` },
      body: JSON.stringify({ requestId: "r1", tool: "readFile", args: { path: "README.md" } })
    }).then((response) => response.json()) as { content: string };

    expect(pair.deviceId).toBeTruthy();
    expect(result.content).toContain("from host");
  });

  it("rejects tool calls from untrusted tokens", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-host-"));

    host = await startRemoteBridgeHost({
      port: 0,
      pairingCode: "123456",
      pairingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceDir: workspace,
      permissionMode: "default",
      trustedDevices: [],
      onTrustDevice: async (device) => device,
      onAudit: async () => undefined
    });

    const response = await fetch(`${host.url}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ requestId: "r1", tool: "listFiles", args: {} })
    });

    expect(response.status).toBe(401);
  });
});
