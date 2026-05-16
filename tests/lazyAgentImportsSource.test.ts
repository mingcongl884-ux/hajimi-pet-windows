import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lazy agent imports source", () => {
  it("loads heavy office agent clients only when a task needs them", () => {
    const mainSource = readFileSync("electron/main.ts", "utf8");

    expect(mainSource).not.toContain('from "./agentClient.js"');
    expect(mainSource).not.toContain('from "./claudeAgentClient.js"');
    expect(mainSource).not.toContain('from "./openClawAgentClient.js"');
    expect(mainSource).not.toContain('import { sendChatMessage');
    expect(mainSource).toContain('import type { ChatMessage } from "./chatClient.js"');
    expect(mainSource).toContain('import("./chatClient.js")');
    expect(mainSource).toContain('import("./claudeAgentClient.js")');
    expect(mainSource).toContain('import("./openClawAgentClient.js")');
    expect(mainSource).toContain('import("./agentClient.js")');
  });
});
