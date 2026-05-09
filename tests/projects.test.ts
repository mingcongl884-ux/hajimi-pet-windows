import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";
import { createConversation, ensureActiveConversation } from "../src/lib/conversations";
import { ensureProjects, removeProject, switchProject, upsertProject } from "../src/lib/projects";

describe("project management", () => {
  it("creates and switches Codex-like projects from workspace folders", () => {
    const first = upsertProject(DEFAULT_SETTINGS, "F:\\test", "2026-05-09T08:00:00.000Z");
    const second = upsertProject(first, "F:\\vscode\\demo", "2026-05-09T08:01:00.000Z");

    expect(second.projects.map((project) => project.name)).toEqual(["test", "demo"]);
    expect(second.agent.workspaceDir).toBe("F:\\vscode\\demo");

    const switched = switchProject(second, second.projects[0].id, "2026-05-09T08:02:00.000Z");
    expect(switched.activeProjectId).toBe(second.projects[0].id);
    expect(switched.agent.workspaceDir).toBe("F:\\test");
  });

  it("keeps conversation history scoped to the active project", () => {
    const withProject = upsertProject(DEFAULT_SETTINGS, "F:\\test", "2026-05-09T08:00:00.000Z");
    const ensured = ensureActiveConversation(ensureProjects(withProject), "2026-05-09T08:01:00.000Z");
    const withSecondConversation = createConversation(ensured, "agent", "2026-05-09T08:02:00.000Z", "office-2");

    expect(withSecondConversation.conversations.every((conversation) =>
      conversation.projectId === withProject.activeProjectId
    )).toBe(true);
    expect(withSecondConversation.activeConversationId).toBe("office-2");
  });

  it("removes project conversations when a project is removed", () => {
    const withProject = upsertProject(DEFAULT_SETTINGS, "F:\\test", "2026-05-09T08:00:00.000Z");
    const ensured = ensureActiveConversation(withProject, "2026-05-09T08:01:00.000Z");
    const removed = removeProject(ensured, withProject.activeProjectId);

    expect(removed.projects).toHaveLength(0);
    expect(removed.conversations.some((conversation) => conversation.projectId === withProject.activeProjectId)).toBe(false);
  });
});
