import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { SkillStore } from "../electron/skillStore";

describe("skill store", () => {
  it("imports a skill folder and persists metadata", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "hajimi-skill-store-"));
    const sourceDir = await mkdtemp(join(tmpdir(), "hajimi-skill-source-"));
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: excel-summary\ndescription: Analyze sheets\n---\nBody", "utf8");
    await mkdir(join(sourceDir, "references"));
    await writeFile(join(sourceDir, "references", "guide.txt"), "guide", "utf8");

    const store = new SkillStore(userDataDir);
    const imported = await store.importSkillFolder(sourceDir);

    expect(imported.name).toBe("excel-summary");
    expect(imported.description).toBe("Analyze sheets");
    expect(imported.enabled).toBe(true);
    await expect(readFile(join(imported.path, "SKILL.md"), "utf8")).resolves.toContain("Analyze sheets");
    await expect(readFile(join(imported.path, "references", "guide.txt"), "utf8")).resolves.toBe("guide");
    await expect(store.listSkills()).resolves.toHaveLength(1);
  });

  it("rejects folders without SKILL.md", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "hajimi-skill-store-"));
    const sourceDir = await mkdtemp(join(tmpdir(), "hajimi-skill-source-"));
    const store = new SkillStore(userDataDir);

    await expect(store.importSkillFolder(sourceDir)).rejects.toThrow(/SKILL\.md/);
  });

  it("updates and removes imported skills", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "hajimi-skill-store-"));
    const sourceDir = await mkdtemp(join(tmpdir(), "hajimi-skill-source-"));
    await writeFile(join(sourceDir, "SKILL.md"), "---\nname: pdf-helper\ndescription: Read PDFs\n---\nBody", "utf8");

    const store = new SkillStore(userDataDir);
    const imported = await store.importSkillFolder(sourceDir);
    const updated = await store.updateSkill(imported.id, {
      enabled: false,
      scope: "project",
      projectPath: "F:/docs"
    });

    expect(updated.enabled).toBe(false);
    expect(updated.scope).toBe("project");
    expect(updated.projectPath).toBe("F:/docs");

    await store.removeSkill(imported.id);
    await expect(store.listSkills()).resolves.toEqual([]);
  });
});
