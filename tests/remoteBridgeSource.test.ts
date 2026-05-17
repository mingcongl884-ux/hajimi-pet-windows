import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("electron/main.ts", "utf8");
const preloadSource = readFileSync("electron/preload.ts", "utf8");
const preloadCjsSource = readFileSync("electron/preload.cjs", "utf8");
const globalSource = readFileSync("src/global.d.ts", "utf8");
const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");

describe("remote bridge source wiring", () => {
  it("wires host bridge IPC without requiring model configuration on the host", () => {
    expect(mainSource).toContain("startRemoteBridgeHost");
    expect(mainSource).toContain("syncRemoteBridgeHost(settings)");
    expect(mainSource).toContain('"pet:start-remote-bridge"');
    expect(mainSource).toContain('"pet:stop-remote-bridge"');
    expect(mainSource).toContain('"pet:generate-remote-pairing-code"');
    expect(mainSource).toContain('"pet:revoke-remote-device"');
    expect(mainSource).toContain('"pet:pair-remote-bridge"');
    expect(mainSource).toContain("pairRemoteBridgeHost(address, pairingCode");
    expect(mainSource).toContain('"pet:discover-remote-bridges"');
    expect(mainSource).toContain("startRemoteBridgeRelayHost");
    expect(mainSource).not.toContain("runClaudeOfficeTask(model, settings.remoteBridge");
    expect(mainSource).not.toContain("runOrdinaryOfficeTask(task.fetchImpl, model, settings.remoteBridge");
  });

  it("exposes remote bridge controls to the renderer", () => {
    expect(preloadSource).toContain("startRemoteBridge");
    expect(preloadSource).toContain("discoverRemoteBridges");
    expect(preloadSource).toContain("generateRemotePairingCode");
    expect(preloadSource).toContain("pairRemoteBridge");
    expect(preloadCjsSource).toContain("startRemoteBridge");
    expect(preloadCjsSource).toContain("discoverRemoteBridges");
    expect(preloadCjsSource).toContain("pairRemoteBridge");
    expect(globalSource).toContain("startRemoteBridge(): Promise<PetAppState>");
    expect(globalSource).toContain("pairRemoteBridge(address: string, pairingCode: string): Promise<PetAppState>");
    expect(globalSource).toContain("discoverRemoteBridges(): Promise<RemoteBridgeDiscoveryResult[]>");
    expect(globalSource).toContain("revokeRemoteDevice(deviceId: string): Promise<PetAppState>");
  });

  it("uses shared bridge target summary helpers in the manager page", () => {
    expect(managerSource).toContain("summarizeRemoteBridgeStatus");
    expect(managerSource).toContain("describeRemoteBridgeTarget");
    expect(managerSource).toContain("window.petApp.pairRemoteBridge");
    expect(managerSource).not.toContain("fetch(new URL(\"/pair\"");
  });
});
