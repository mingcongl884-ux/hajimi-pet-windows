import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("electron/main.ts", "utf8");
const preloadSource = readFileSync("electron/preload.ts", "utf8");
const preloadCjsSource = readFileSync("electron/preload.cjs", "utf8");
const globalSource = readFileSync("src/global.d.ts", "utf8");

describe("remote bridge source wiring", () => {
  it("wires host bridge IPC without requiring model configuration on the host", () => {
    expect(mainSource).toContain("startRemoteBridgeHost");
    expect(mainSource).toContain("syncRemoteBridgeHost(settings)");
    expect(mainSource).toContain('"pet:start-remote-bridge"');
    expect(mainSource).toContain('"pet:stop-remote-bridge"');
    expect(mainSource).toContain('"pet:generate-remote-pairing-code"');
    expect(mainSource).toContain('"pet:revoke-remote-device"');
    expect(mainSource).toContain('"pet:discover-remote-bridges"');
    expect(mainSource).toContain("startRemoteBridgeRelayHost");
    expect(mainSource).not.toContain("runClaudeOfficeTask(model, settings.remoteBridge");
    expect(mainSource).not.toContain("runOrdinaryOfficeTask(task.fetchImpl, model, settings.remoteBridge");
  });

  it("exposes remote bridge controls to the renderer", () => {
    expect(preloadSource).toContain("startRemoteBridge");
    expect(preloadSource).toContain("discoverRemoteBridges");
    expect(preloadSource).toContain("generateRemotePairingCode");
    expect(preloadCjsSource).toContain("startRemoteBridge");
    expect(preloadCjsSource).toContain("discoverRemoteBridges");
    expect(globalSource).toContain("startRemoteBridge(): Promise<PetAppState>");
    expect(globalSource).toContain("discoverRemoteBridges(): Promise<RemoteBridgeDiscoveryResult[]>");
    expect(globalSource).toContain("revokeRemoteDevice(deviceId: string): Promise<PetAppState>");
  });
});
