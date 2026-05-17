import { resolveOfficeSkillContext } from "../electron/skillContext";
import type { ManagedSkill } from "../src/lib/skills";

const baseSkill: ManagedSkill = {
  id: "excel",
  name: "excel-summary",
  description: "Analyze spreadsheets",
  path: "C:/skills/excel",
  source: "managed",
  enabled: true,
  scope: "global",
  importedAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  warnings: []
};

describe("office skill context", () => {
  it("resolves enabled global and matching project skills", async () => {
    const projectSkill: ManagedSkill = {
      ...baseSkill,
      id: "project-pdf",
      name: "pdf-helper",
      description: "Read PDFs",
      scope: "project",
      projectPath: "F:/docs"
    };

    const context = await resolveOfficeSkillContext({
      skills: [
        baseSkill,
        projectSkill,
        { ...baseSkill, id: "disabled", name: "disabled", enabled: false },
        { ...projectSkill, id: "other-project", name: "other", projectPath: "F:/other" }
      ],
      task: "整理资料",
      projectPath: "F:/docs",
      mode: "auto",
      pinnedSkillIds: [],
      readBody: async () => "body"
    });

    expect(context.availableSkills.map((skill) => skill.name)).toEqual(["excel-summary", "pdf-helper"]);
    expect(context.loadedSkills).toEqual([]);
    expect(context.contextText).toContain("excel-summary");
    expect(context.contextText).toContain("pdf-helper");
    expect(context.contextText).not.toContain("disabled");
  });

  it("loads a skill body when slash invoked", async () => {
    const context = await resolveOfficeSkillContext({
      skills: [baseSkill],
      task: "/excel-summary 拆分表格",
      projectPath: "F:/docs",
      mode: "auto",
      pinnedSkillIds: [],
      readBody: async (skill) => `${skill.name} body`
    });

    expect(context.invocation).toEqual({ skillName: "excel-summary", prompt: "拆分表格" });
    expect(context.loadedSkills).toHaveLength(1);
    expect(context.pinnedSkillNames).toEqual(["excel-summary"]);
    expect(context.contextText).toContain("excel-summary body");
  });

  it("respects off mode and pinned ids", async () => {
    await expect(resolveOfficeSkillContext({
      skills: [baseSkill],
      task: "/excel-summary 拆表",
      projectPath: "F:/docs",
      mode: "off",
      pinnedSkillIds: [],
      readBody: async () => "body"
    })).resolves.toMatchObject({ availableSkills: [], loadedSkills: [] });

    const pinned = await resolveOfficeSkillContext({
      skills: [baseSkill],
      task: "拆表",
      projectPath: "F:/docs",
      mode: "pinned",
      pinnedSkillIds: ["excel"],
      readBody: async () => "body"
    });
    expect(pinned.loadedSkills).toHaveLength(1);
    expect(pinned.pinnedSkillNames).toEqual(["excel-summary"]);
  });
});
