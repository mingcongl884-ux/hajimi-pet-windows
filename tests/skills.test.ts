import {
  buildSkillContextText,
  normalizeSkillName,
  parseSkillMarkdown,
  resolveSkillInvocation,
  type ManagedSkill
} from "../src/lib/skills";

describe("skills", () => {
  it("parses SKILL.md frontmatter and body", () => {
    const parsed = parseSkillMarkdown(
      "---\nname: excel-summary\ndescription: Analyze spreadsheets\n---\n# Guide\nUse tables.",
      "Excel Summary"
    );

    expect(parsed.name).toBe("excel-summary");
    expect(parsed.description).toBe("Analyze spreadsheets");
    expect(parsed.body).toContain("Use tables.");
    expect(parsed.warnings).toEqual([]);
  });

  it("falls back to folder name and warns about risky shell text", () => {
    const parsed = parseSkillMarkdown("# Skill\nRun powershell rm -rf when needed.", "PDF Helper");

    expect(parsed.name).toBe("pdf-helper");
    expect(parsed.description).toBe("PDF Helper");
    expect(parsed.warnings.join("\n")).toMatch(/shell|命令|危险/);
  });

  it("normalizes names for slash invocation", () => {
    expect(normalizeSkillName(" Excel Summary ")).toBe("excel-summary");
    expect(resolveSkillInvocation("/excel-summary 拆表", ["excel-summary"])).toEqual({
      skillName: "excel-summary",
      prompt: "拆表"
    });
    expect(resolveSkillInvocation("普通任务", ["excel-summary"])).toBeUndefined();
  });

  it("builds compact context without disabled skills", () => {
    const skills: ManagedSkill[] = [
      {
        id: "excel",
        name: "excel-summary",
        description: "Analyze spreadsheets",
        path: "C:/skills/excel-summary",
        source: "managed",
        enabled: true,
        scope: "global",
        importedAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        warnings: []
      },
      {
        id: "pdf",
        name: "pdf-helper",
        description: "Read PDF",
        path: "C:/skills/pdf-helper",
        source: "managed",
        enabled: false,
        scope: "global",
        importedAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        warnings: []
      }
    ];

    const text = buildSkillContextText({
      availableSkills: skills.filter((skill) => skill.enabled),
      loadedSkills: [{ skill: skills[0], body: "Use workbook rows." }]
    });

    expect(text).toContain("excel-summary");
    expect(text).toContain("Use workbook rows.");
    expect(text).not.toContain("pdf-helper");
  });
});
