import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manager office workspace source", () => {
  it("renders a Codex-like office workspace with conversation history and chat", () => {
    const managerSource = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(managerSource).toContain("manager-app-shell");
    expect(managerSource).toContain("codex-sidebar");
    expect(managerSource).toContain("codex-project-list");
    expect(managerSource).toContain("collapsedProjectIds");
    expect(managerSource).toContain("projectConversations");
    expect(managerSource).toContain("codex-project-conversations");
    expect(managerSource).toContain("onSwitchProject");
    expect(managerSource).toContain("onDeleteProject");
    expect(managerSource).toContain("codex-chat-main");
    expect(managerSource).toContain("office-mode-switch");
    expect(managerSource).toContain("switchOfficeProvider");
    expect(managerSource).toContain("codex-conversation-rename");
    expect(managerSource).toContain("onRenameConversation");
    expect(managerSource).toContain("composer-permission-select");
    expect(managerSource).toContain("composer-model-select");
    expect(managerSource).toContain("onSendMessage");
    expect(managerSource).not.toContain("className=\"model-routing\"");
    expect(appSource).toContain("onSendMessage={sendMessage}");
  });
});
