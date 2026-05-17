import { readFileSync } from "node:fs";

describe("fallback agent skill context source", () => {
  it("adds resolved skill context to fallback prompts without changing permission mode", () => {
    const source = readFileSync("electron/agentClient.ts", "utf8");

    expect(source).toContain("skillContext?: ResolvedSkillContext");
    expect(source).toContain("context.skillContext?.contextText");
    expect(source).toContain("HaJiMi skill context");
    expect(source).toContain("Permission mode:");
  });
});
