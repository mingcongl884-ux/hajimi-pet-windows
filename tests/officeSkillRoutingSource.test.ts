import { readFileSync } from "node:fs";

describe("office skill routing source", () => {
  it("resolves skills once in main and passes context to all office backends", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const globalTypes = readFileSync("src/global.d.ts", "utf8");

    expect(main).toContain("resolveOfficeSkillContext");
    expect(main).toContain("buildOfficeSkillContext(settings, taskPrompt, skillRequest)");
    expect(main).toContain("skillContext");
    expect(main).toContain("runRemoteBridgeAgentTask(task.fetchImpl, model, settings.agent, taskPrompt, task.controller, remoteHost, skillContext)");
    expect(preload).toContain("runAgentTask: (task: string, modelId?: string, requestId?: string, skillRequest?: OfficeSkillRequest)");
    expect(globalTypes).toContain("runAgentTask(task: string, modelId?: string, requestId?: string, skillRequest?: OfficeSkillRequest)");
  });
});
