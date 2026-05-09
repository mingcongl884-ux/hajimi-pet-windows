import type { AppSettings, AgentProject } from "../../electron/settingsStore.js";

export function createProjectFromPath(path: string, now = new Date().toISOString()): AgentProject {
  return {
    id: `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: projectNameFromPath(path),
    path,
    updatedAt: now
  };
}

export function projectNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || "未命名项目";
}

export function ensureProjects(settings: AppSettings, now = new Date().toISOString()): AppSettings {
  if (settings.projects.length > 0) {
    const activeProject = settings.projects.find((project) => project.id === settings.activeProjectId);
    if (activeProject) {
      return settings.agent.workspaceDir === activeProject.path
        ? settings
        : { ...settings, agent: { ...settings.agent, workspaceDir: activeProject.path } };
    }

    const first = settings.projects[0];
    return {
      ...settings,
      activeProjectId: first.id,
      agent: { ...settings.agent, workspaceDir: first.path }
    };
  }

  if (!settings.agent.workspaceDir.trim()) {
    return settings;
  }

  const project = {
    ...createProjectFromPath(settings.agent.workspaceDir, now),
    id: "default-project"
  };
  return {
    ...settings,
    activeProjectId: project.id,
    projects: [project],
    conversations: settings.conversations.map((conversation) => ({
      ...conversation,
      projectId: conversation.projectId || project.id
    }))
  };
}

export function upsertProject(settings: AppSettings, path: string, now = new Date().toISOString()): AppSettings {
  const prepared = ensureProjects(settings, now);
  const existing = prepared.projects.find((project) => samePath(project.path, path));
  if (existing) {
    return {
      ...prepared,
      activeProjectId: existing.id,
      projects: prepared.projects.map((project) =>
        project.id === existing.id ? { ...project, updatedAt: now } : project
      ),
      agent: { ...prepared.agent, workspaceDir: existing.path }
    };
  }

  const project = createProjectFromPath(path, now);
  const isFirstProject = prepared.projects.length === 0;
  return {
    ...prepared,
    activeProjectId: project.id,
    projects: [...prepared.projects, project],
    agent: { ...prepared.agent, workspaceDir: path },
    conversations: isFirstProject
      ? prepared.conversations.map((conversation) => ({ ...conversation, projectId: conversation.projectId || project.id }))
      : prepared.conversations
  };
}

export function switchProject(settings: AppSettings, projectId: string, now = new Date().toISOString()): AppSettings {
  const prepared = ensureProjects(settings, now);
  const project = prepared.projects.find((item) => item.id === projectId);
  if (!project) {
    return prepared;
  }

  return {
    ...prepared,
    activeProjectId: project.id,
    projects: prepared.projects.map((item) =>
      item.id === project.id ? { ...item, updatedAt: now } : item
    ),
    agent: { ...prepared.agent, workspaceDir: project.path }
  };
}

export function removeProject(settings: AppSettings, projectId: string): AppSettings {
  const remaining = settings.projects.filter((project) => project.id !== projectId);
  const nextActive = settings.activeProjectId === projectId ? remaining[0] : remaining.find((project) => project.id === settings.activeProjectId);
  return {
    ...settings,
    activeProjectId: nextActive?.id ?? "",
    projects: remaining,
    agent: { ...settings.agent, workspaceDir: nextActive?.path ?? "" },
    conversations: settings.conversations.filter((conversation) => conversation.projectId !== projectId)
  };
}

function samePath(left: string, right: string): boolean {
  return left.trim().replace(/[\\/]+$/, "").toLowerCase() === right.trim().replace(/[\\/]+$/, "").toLowerCase();
}
