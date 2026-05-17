import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore, type AppSettings } from "../electron/settingsStore";
import { cloneRemoteBridgeSettings, ensureRemoteBridgeSettings, summarizeRemoteBridgeStatus } from "../src/lib/remoteBridge";

describe("remote bridge settings", () => {
  it("hydrates default bridge settings without a model on the host", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hajimi-remote-bridge-"));
    const store = new SettingsStore(dir);

    const settings = await store.loadSettings();

    expect(settings.remoteBridge.enabled).toBe(false);
    expect(settings.remoteBridge.relay.enabled).toBe(false);
    expect(settings.remoteBridge.relay.url).toBe("");
    expect(settings.remoteBridge.host.port).toBe(18031);
    expect(settings.remoteBridge.host.permissionMode).toBe("default");
    expect(settings.remoteBridge.trustedDevices).toEqual([]);
    expect(settings.remoteBridge.knownHosts).toEqual([]);
    expect(settings.remoteBridge.activeTargetId).toBe("local");
    expect(DEFAULT_SETTINGS.remoteBridge.activeTargetId).toBe("local");
  });

  it("fills bridge defaults when renderer receives legacy settings", () => {
    const legacySettings = {
      ...DEFAULT_SETTINGS,
      remoteBridge: undefined
    } as unknown as AppSettings;

    const settings = ensureRemoteBridgeSettings(legacySettings);

    expect(settings.remoteBridge.enabled).toBe(false);
    expect(settings.remoteBridge.activeTargetId).toBe("local");
    expect(settings.remoteBridge.knownHosts).toEqual([]);
    expect(settings.remoteBridge.trustedDevices).toEqual([]);
  });

  it("summarizes bridge status and the active execution target", () => {
    const settings = cloneRemoteBridgeSettings({
      enabled: true,
      activeTargetId: "workstation-1",
      deviceName: "Desk Host",
      host: { status: "listening", permissionMode: "auto-review" },
      relay: { enabled: true, url: "https://relay.example.com", status: "connected" },
      knownHosts: [
        {
          id: "workstation-1",
          name: "Workstation",
          address: "http://10.0.0.8:18031",
          token: "token",
          permissionMode: "default",
          transport: "http"
        }
      ]
    });

    const summary = summarizeRemoteBridgeStatus(settings);

    expect(summary.local.status).toBe("listening");
    expect(summary.local.label).toBe("Listening");
    expect(summary.relay.status).toBe("connected");
    expect(summary.relay.label).toBe("Connected");
    expect(summary.activeTarget.label).toBe("Workstation");
    expect(summary.activeTarget.description).toBe("Remote device: Workstation (http://10.0.0.8:18031)");
  });
});
