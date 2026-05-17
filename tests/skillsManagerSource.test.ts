import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("skills manager source", () => {
  it("adds a compact skills page and routes skill IPC through the manager UI", () => {
    const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const sidebarSource = readFileSync("src/components/ManagerSidebar.tsx", "utf8");
    const stylesSource = readFileSync("src/styles.css", "utf8");

    expect(sidebarSource).toContain('type ManagerSection = "office" | "pets" | "settings"');
    expect(sidebarSource).toContain('type SettingsTab = "general" | "models" | "skills" | "channels"');
    expect(sidebarSource).toContain('{ id: "skills"');
    expect(managerSource).toContain('section === "settings" && settingsTab === "skills"');
    expect(managerSource).toContain("skills");
    expect(managerSource).toContain("selectedSkillId");
    expect(managerSource).toContain("refreshSkills");
    expect(managerSource).toContain("importSkill");
    expect(managerSource).toContain("updateSkill");
    expect(managerSource).toContain("removeSkill");
    expect(managerSource).toContain("skill-manager-layout");
    expect(managerSource).toContain("skill-index-row");
    expect(managerSource).toContain("skill-detail-card");
    expect(stylesSource).toContain(".skill-manager-layout");
    expect(stylesSource).toContain(".skill-index-row.active");
    expect(stylesSource).toContain(".skill-warning-list");
  });
});
