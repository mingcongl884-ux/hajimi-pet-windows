import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("capability check source wiring", () => {
  it("exposes capability checks through Electron and the manager UI", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const global = readFileSync("src/global.d.ts", "utf8");
    const manager = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const electronCheck = readFileSync("electron/capabilityCheck.ts", "utf8");

    expect(main).toContain("pet:check-capabilities");
    expect(preload).toContain("checkCapabilities");
    expect(global).toContain("checkCapabilities(): Promise<CapabilityCheckResult>");
    expect(manager).toContain("能力体检");
    expect(manager).toContain("summarizeCapabilities");
    expect(electronCheck).toContain("resolveClaudeCodeExecutable");
    expect(electronCheck).toContain("resolveBundledOpenClawCli");
    expect(electronCheck).toContain("hajimi-capability-check-");
    expect(electronCheck).toContain('open(probePath, "wx")');
  });
});
