import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { callRemoteBridgeTool } from "../electron/remoteBridgeClient";
import { startRemoteBridgeHost, type RemoteBridgeHostController } from "../electron/remoteBridgeHost";
import type { RemoteKnownHost, RemoteTrustedDevice } from "../src/lib/remoteBridge";

let host: RemoteBridgeHostController | undefined;

afterEach(async () => {
  await host?.stop();
  host = undefined;
});

describe("remote bridge client", () => {
  it("calls a paired host tool with the stored host token", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-client-"));
    await writeFile(join(workspace, "README.md"), "client reached host", "utf8");
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
      body: JSON.stringify({ pairingCode: "123456", deviceName: "Controller" })
    }).then((response) => response.json()) as { token: string; deviceId: string };
    const knownHost: RemoteKnownHost = {
      id: pair.deviceId,
      name: "Host",
      address: host.url,
      token: pair.token,
      permissionMode: "default"
    };

    const result = await callRemoteBridgeTool(knownHost, {
      requestId: "r1",
      tool: "readFile",
      args: { path: "README.md" }
    });

    expect(result.content).toContain("client reached host");
  });
});
