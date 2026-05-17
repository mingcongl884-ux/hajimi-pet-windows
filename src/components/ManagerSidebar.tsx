import {
  Bot,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MessageCircle,
  Plus,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings, PetConversation, PetConversationMode } from "../../electron/settingsStore";

export type ManagerSection = "office" | "pets" | "settings";
export type SettingsTab = "general" | "models" | "skills" | "channels";

type Props = {
  settings: AppSettings;
  section: ManagerSection;
  projectName: string;
  visibleConversations: PetConversation[];
  collapsedProjectIds: string[];
  settingsTab: SettingsTab;
  renderConversationRow(conversation: PetConversation): ReactNode;
  onChooseWorkspace(): void | Promise<void>;
  onCreateConversation(mode: PetConversationMode): void | Promise<void>;
  onSwitchProject(projectId: string): void | Promise<void>;
  onDeleteProject(projectId: string): void | Promise<void>;
  onToggleProjectCollapsed(projectId: string): void;
  onSectionChange(section: ManagerSection): void;
  onSettingsTabChange(tab: SettingsTab): void;
};

const navItems: Array<{ id: ManagerSection; label: string; icon: typeof Bot }> = [
  { id: "pets", label: "宠物", icon: Bot },
  { id: "settings", label: "设置", icon: Settings2 }
];

const settingsItems: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: "general", label: "常规", icon: SlidersHorizontal },
  { id: "models", label: "模型", icon: Settings2 },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "channels", label: "通道", icon: MessageCircle }
];

export default function ManagerSidebar({
  settings,
  section,
  projectName,
  visibleConversations,
  collapsedProjectIds,
  settingsTab,
  renderConversationRow,
  onChooseWorkspace,
  onCreateConversation,
  onSwitchProject,
  onDeleteProject,
  onToggleProjectCollapsed,
  onSectionChange,
  onSettingsTabChange
}: Props) {
  if (section === "settings") {
    return (
      <aside className="codex-sidebar settings-sidebar">
        <button className="settings-back-button" onClick={() => onSectionChange("office")}>
          返回应用
        </button>
        <nav className="settings-sidebar-nav" aria-label="设置">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={settingsTab === item.id ? "active" : ""}
                key={item.id}
                onClick={() => onSettingsTabChange(item.id)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="codex-sidebar">
      <section className="codex-sidebar-section">
        <div className="codex-sidebar-heading">
          <p className="codex-sidebar-label">项目</p>
          <button title="选择新项目" onClick={() => void onChooseWorkspace()}>
            <Plus size={14} />
          </button>
        </div>
        <div className="codex-project-list">
          {settings.projects.length === 0 && (
            <div className="codex-project-item active">
              <div className="codex-project-header">
                <button className="codex-project-toggle" title="展开会话" onClick={() => undefined}>
                  <ChevronDown size={14} />
                </button>
                <button className="codex-project-row active" onClick={() => void onChooseWorkspace()}>
                  <FolderOpen size={15} />
                  <span>{projectName}</span>
                </button>
                <button className="codex-project-new-conversation" title="新建会话" onClick={() => void onCreateConversation("agent")}>
                  <Plus size={13} />
                </button>
              </div>
              <div className="codex-project-conversations">
                {visibleConversations.map(renderConversationRow)}
              </div>
            </div>
          )}
          {settings.projects.map((project) => {
            const projectConversations = settings.conversations.filter(
              (conversation) => (conversation.projectId || "") === project.id
            );
            const expanded = !collapsedProjectIds.includes(project.id);
            const active = project.id === settings.activeProjectId;
            return (
              <div className={active ? "codex-project-item active" : "codex-project-item"} key={project.id}>
                <div className="codex-project-header">
                  <button
                    className="codex-project-toggle"
                    title={expanded ? "收起会话" : "展开会话"}
                    onClick={() => onToggleProjectCollapsed(project.id)}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button className="codex-project-row" onClick={() => void onSwitchProject(project.id)}>
                    <FolderOpen size={15} />
                    <span>{project.name}</span>
                  </button>
                  {active && (
                    <button
                      className="codex-project-new-conversation"
                      title="新建会话"
                      onClick={() => void onCreateConversation("agent")}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                  <button
                    className="codex-project-delete"
                    disabled={settings.projects.length <= 1}
                    title="移除项目"
                    onClick={() => void onDeleteProject(project.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {expanded && (
                  <div className="codex-project-conversations">
                    {projectConversations.map(renderConversationRow)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <nav className="codex-sidebar-nav" aria-label="管理">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
