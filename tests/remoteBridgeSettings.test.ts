import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore } from "../electron/settingsStore";

describe("remote bridge settings", () => {
  it("hydrates default bridge settings without a model on the host", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hajimi-remote-bridge-"));
    const store = new SettingsStore(dir);

    const settings = await store.loadSettings();

    expect(settings.remoteBridge.enabled).toBe(false);
    expect(settings.remoteBridge.host.port).toBe(18031);
    expect(settings.remoteBridge.host.permissionMode).toBe("default");
    expect(settings.remoteBridge.trustedDevices).toEqual([]);
    expect(settings.remoteBridge.knownHosts).toEqual([]);
    expect(settings.remoteBridge.activeTargetId).toBe("local");
    expect(DEFAULT_SETTINGS.remoteBridge.activeTargetId).toBe("local");
  });
});
