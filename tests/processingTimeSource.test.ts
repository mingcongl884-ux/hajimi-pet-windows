import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const chatClientSource = readFileSync(join(process.cwd(), "electron", "chatClient.ts"), "utf8");
const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");
const chatPanelSource = readFileSync(join(process.cwd(), "src", "components", "ChatPanel.tsx"), "utf8");

describe("assistant processing time", () => {
  it("records and renders assistant response duration", () => {
    expect(chatClientSource).toContain("durationMs?: number");
    expect(appSource).toContain("const startedAt = Date.now()");
    expect(appSource).toContain("durationMs: Date.now() - startedAt");
    expect(managerSource).toContain("formatProcessingTime");
    expect(chatPanelSource).toContain("formatProcessingTime");
  });
});
