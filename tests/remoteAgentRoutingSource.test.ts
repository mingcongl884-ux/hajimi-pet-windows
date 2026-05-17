import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("electron/main.ts", "utf8");
const agentSource = readFileSync("electron/agentClient.ts", "utf8");

describe("remote agent routing source", () => {
  it("injects remote execution context and routes ordinary tools to remote bridge hosts", () => {
    expect(agentSource).toContain("type AgentToolExecutor");
    expect(agentSource).toContain("remoteToolExecutor");
    expect(agentSource).toContain("executionContext");
    expect(mainSource).toContain("runRemoteBridgeAgentTask");
    expect(mainSource).toContain("settings.remoteBridge.activeTargetId");
    expect(mainSource).toContain("callRemoteBridgeTool");
    expect(mainSource).toContain("describeExecutionTarget(remoteHost)");
    expect(mainSource).toContain('remoteHost?.transport === "relay"');
    expect(agentSource).toContain("Current execution environment: ${executionContext}");
  });
});
