import { describe, expect, it } from "vitest";
import { discoverRemoteBridgeHosts, startRemoteBridgeDiscoveryResponder } from "../electron/remoteBridgeDiscovery";

describe("remote bridge discovery", () => {
  it("discovers a bridge responder on the local network", async () => {
    const responder = await startRemoteBridgeDiscoveryResponder({
      discoveryPort: 0,
      deviceName: "Office PC",
      servicePort: 18031,
      permissionMode: "full-access",
      workspaceReady: true,
      pairingAvailable: true
    });

    try {
      const hosts = await discoverRemoteBridgeHosts({
        discoveryPort: responder.port,
        timeoutMs: 120,
        targets: ["127.0.0.1"]
      });

      expect(hosts).toEqual([
        expect.objectContaining({
          name: "Office PC",
          address: "http://127.0.0.1:18031",
          permissionMode: "full-access",
          workspaceReady: true,
          pairingAvailable: true
        })
      ]);
    } finally {
      await responder.stop();
    }
  });
});
