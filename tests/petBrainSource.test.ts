import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pet brain model binding source", () => {
  it("binds each visible pet to a model while sharing the active conversation", () => {
    const settingsSource = readFileSync("electron/settingsStore.ts", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const globalSource = readFileSync("src/global.d.ts", "utf8");

    expect(settingsSource).toContain("petModelBindings");
    expect(managerSource).toContain("pet-model-select");
    expect(managerSource).toContain("updatePetModelBinding");
    expect(appSource).toContain("currentPetModelId");
    expect(appSource).toContain('currentPetModel?.provider === "claude-agent"');
    expect(appSource).toContain('activeAgentModel?.provider === "claude-agent"');
    expect(appSource).toContain("sendChat(requestMessages, currentPetModelId, requestId)");
    expect(appSource).toContain("runAgentTask(content.trim(), currentPetModelId, requestId)");
    expect(appSource).toContain("sendChat(requestMessages, activeAgentModelId, requestId)");
    expect(appSource).toContain("runAgentTask(content.trim(), activeAgentModelId, requestId)");
    expect(appSource).toContain("setMovement");
    expect(appSource).toContain("movementEnabled");
    expect(appSource).toContain("labelPetResponse");
    expect(globalSource).toContain("sendChat(messages: ChatMessage[], modelId?: string, requestId?: string)");
    expect(globalSource).toContain("runAgentTask(task: string, modelId?: string, requestId?: string)");
  });
});
