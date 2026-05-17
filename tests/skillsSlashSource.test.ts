import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("office slash skills source", () => {
  it("lets the composer invoke skills with a slash command", () => {
    const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const stylesSource = readFileSync("src/styles.css", "utf8");

    expect(managerSource).toContain("skillMenuOpen");
    expect(managerSource).toContain("handleOfficeDraftChange");
    expect(managerSource).toContain("selectComposerSkill");
    expect(managerSource).toContain("composerSkillRequest");
    expect(managerSource).toContain("sendPreparedOfficeMessage(message, undefined, hasAttachments, composerSkillRequest)");
    expect(managerSource).toContain("onSendOfficeMessage(message, modelIdOverride, skillRequest)");
    expect(managerSource).toContain("composer-skill-menu");
    expect(managerSource).toContain("filteredSlashSkills");
    expect(appSource).toContain("skillRequest?: OfficeSkillRequest");
    expect(appSource).toContain("runAgentTask(content.trim(), requestModelId, requestId, skillRequest)");
    expect(stylesSource).toContain(".composer-skill-menu");
    expect(stylesSource).toContain(".composer-skill-option");
  });
});
