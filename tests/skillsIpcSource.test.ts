import { readFileSync } from "node:fs";

describe("skills IPC source", () => {
  it("exposes skill management IPC from main and preload", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const globalTypes = readFileSync("src/global.d.ts", "utf8");

    expect(main).toContain("new SkillStore(app.getPath(\"userData\"))");
    expect(main).toContain("pet:list-skills");
    expect(main).toContain("pet:import-skill-folder");
    expect(main).toContain("pet:update-skill");
    expect(main).toContain("pet:remove-skill");
    expect(preload).toContain("listSkills:");
    expect(preload).toContain("importSkillFolder:");
    expect(globalTypes).toContain("listSkills(): Promise<ManagedSkill[]>");
  });
});
