import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cancellable chat tasks source", () => {
  it("wires cancellation through the renderer preload and main process", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    const preloadSource = readFileSync("electron/preload.ts", "utf8");
    const globalSource = readFileSync("src/global.d.ts", "utf8");
    const mainSource = readFileSync("electron/main.ts", "utf8");
    const claudeAgentSource = readFileSync("electron/claudeAgentClient.ts", "utf8");

    expect(appSource).toContain("cancelActiveMessage");
    expect(appSource).toContain("createChatRequestId");
    expect(appSource).toContain("cancelChatTask(activeRequestId)");
    expect(appSource).toContain("runAgentTask(content.trim(), currentPetModelId, requestId)");
    expect(appSource).toContain("sendChat(requestMessages, currentPetModelId, requestId)");
    expect(preloadSource).toContain("cancelChatTask: (requestId: string) => ipcRenderer.invoke(\"pet:cancel-chat-task\", requestId)");
    expect(globalSource).toContain("cancelChatTask(requestId: string): Promise<boolean>");
    expect(mainSource).toContain("activeChatTaskControllers");
    expect(mainSource).toContain("ipcMain.handle(\"pet:cancel-chat-task\"");
    expect(mainSource).toContain("AbortController");
    expect(mainSource).toContain("runClaudeAgentTask(model, settings.agent, taskPrompt, task.controller)");
    expect(claudeAgentSource).toContain("throw new ChatClientError(\"cancelled\"");
  });
});
