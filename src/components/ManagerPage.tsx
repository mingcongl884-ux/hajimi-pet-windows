import {
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import type { ChannelAdapterResult } from "../../electron/channelAdapters";
import type { ChatMessage } from "../../electron/chatClient";
import type { UpdateCheckResult } from "../../electron/networkClient";
import type { AgentPermissionMode, AppSettings, ModelProfile, ModelProvider, PetConversation, PetConversationMode } from "../../electron/settingsStore";
import type { RemoteNotice } from "../../electron/settingsStore";
import type { PetAppState } from "../global";
import { toggleActivePetId } from "../lib/activePets";
import { openClawSetupSteps, type ChannelProvider, type ChannelSettings } from "../lib/channels";
import { ensureProjects } from "../lib/projects";
import { buildAttachmentMessage, fileToPromptAttachment, type PromptAttachment } from "../lib/fileMessage";
import { ensureModelProfiles, upsertModelProfile } from "../lib/modelProfiles";

type Props = {
  state: PetAppState;
  onImport(): Promise<void>;
  onDeletePet(petId: string): Promise<void>;
  onChooseWorkspace(): Promise<void>;
  onSwitchProject(projectId: string): Promise<void>;
  onDeleteProject(projectId: string): Promise<void>;
  onTestModel(model: ModelProfile): Promise<string>;
  onCheckUpdates(): Promise<UpdateCheckResult>;
  onDownloadUpdate(): Promise<UpdateCheckResult>;
  onInstallUpdate(): Promise<UpdateCheckResult>;
  onCheckNotices(): Promise<{ notices: RemoteNotice[]; checkedAt: string; message?: string }>;
  onStartChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
  onStopChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
  onTestChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
  onSave(settings: AppSettings): Promise<void>;
  chatError?: string;
  onCreateConversation(mode: PetConversationMode): Promise<void>;
  onSwitchConversation(conversationId: string): Promise<void>;
  onDeleteConversation(conversationId: string): Promise<void>;
  onRenameConversation(conversationId: string, title: string): Promise<void>;
  onSendMessage(message: ChatMessage): Promise<void>;
  onSendOfficeMessage(message: ChatMessage): Promise<void>;
  onCancelMessage(): Promise<void> | void;
};

type ManagerSection = "office" | "pets" | "models" | "channels" | "system";

const navItems: Array<{ id: ManagerSection; label: string; icon: typeof Bot }> = [
  { id: "office", label: "办公区", icon: BriefcaseBusiness },
  { id: "pets", label: "宠物", icon: Bot },
  { id: "models", label: "模型", icon: Settings2 },
  { id: "channels", label: "通道", icon: MessageCircle },
  { id: "system", label: "系统", icon: SlidersHorizontal }
];

const permissionOptions: Array<{ id: AgentPermissionMode; label: string; description: string }> = [
  { id: "default", label: "默认权限", description: "读写项目文件，命令需要提高权限后执行。" },
  { id: "auto-review", label: "自动审查", description: "自动运行安全命令，拦截明显危险操作。" },
  { id: "full-access", label: "完全访问权限", description: "信任当前项目，允许更完整的办公能力。" }
];

const providerOptions: Array<{ id: ModelProvider; label: string; description: string }> = [
  { id: "openai-compatible", label: "OpenAI 兼容", description: "普通聊天和内置办公工具代理，适合大多数兼容接口。" },
  { id: "claude-agent", label: "Claude Agent SDK", description: "高级办公模式，使用 Claude Code 同源的 Agent SDK 工具循环。" }
];

function providerLabel(provider: ModelProvider) {
  return provider === "claude-agent" ? "Claude Agent SDK" : "OpenAI 兼容";
}

export default function ManagerPage({
  state,
  onImport,
  onDeletePet,
  onChooseWorkspace,
  onSwitchProject,
  onDeleteProject,
  onTestModel,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onCheckNotices,
  onStartChannel,
  onStopChannel,
  onTestChannel,
  onSave,
  chatError,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onRenameConversation,
  onSendOfficeMessage,
  onCancelMessage
}: Props) {
  const [section, setSection] = useState<ManagerSection>("office");
  const [settings, setSettings] = useState(ensureProjects(ensureModelProfiles(state.settings)));
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<string[]>(() =>
    settings.projects.filter((project) => project.id !== settings.activeProjectId).map((project) => project.id)
  );
  const [saving, setSaving] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string>();
  const [selectedModelId, setSelectedModelId] = useState(state.settings.activeAgentModelId || state.settings.activeChatModelId);
  const [testMessage, setTestMessage] = useState<string>();
  const [officeDraft, setOfficeDraft] = useState("");
  const [sendingOfficeMessage, setSendingOfficeMessage] = useState(false);
  const [pendingOfficeAttachments, setPendingOfficeAttachments] = useState<PromptAttachment[]>([]);
  const [officeDragActive, setOfficeDragActive] = useState(false);
  const [officeElapsedMs, setOfficeElapsedMs] = useState(1000);
  const [networkMessage, setNetworkMessage] = useState<string>();
  const [channelMessage, setChannelMessage] = useState<string>();
  const [channelBusyProvider, setChannelBusyProvider] = useState<ChannelProvider>();
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResult["status"]>();
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string>();
  const [renamingConversationId, setRenamingConversationId] = useState<string>();
  const [renamingTitle, setRenamingTitle] = useState("");
  const [renamingPetId, setRenamingPetId] = useState<string>();
  const [renamingPetName, setRenamingPetName] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const officeFileInputRef = useRef<HTMLInputElement>(null);
  const officeDraftInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSettings(ensureProjects(ensureModelProfiles(state.settings))), [state.settings]);
  useEffect(() => {
    const prepared = ensureModelProfiles(state.settings);
    if (!prepared.models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(prepared.activeAgentModelId || prepared.models[0]?.id);
    }
  }, [selectedModelId, state.settings]);
  useEffect(() => {
    setCollapsedProjectIds((projectIds) =>
      projectIds.filter((projectId) =>
        projectId !== settings.activeProjectId && settings.projects.some((project) => project.id === projectId)
      )
    );
  }, [settings.activeProjectId, settings.projects]);
  useEffect(() => {
    if (!modelMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !modelMenuRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelMenuOpen]);
  useEffect(() => {
    if (!sendingOfficeMessage) {
      setOfficeElapsedMs(1000);
      return;
    }

    const startedAt = Date.now();
    setOfficeElapsedMs(1000);
    const timer = window.setInterval(() => {
      setOfficeElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sendingOfficeMessage]);

  async function save(next = settings) {
    setSaving(true);
    await onSave(ensureProjects(ensureModelProfiles(next)));
    setSaving(false);
  }

  async function update(next: AppSettings) {
    setSettings(next);
    await save(next);
  }

  async function chooseWorkspace() {
    setSaving(true);
    await onChooseWorkspace();
    setSaving(false);
  }

  function updateModel(modelId: string, patch: Partial<ModelProfile>) {
    setSettings({
      ...settings,
      models: settings.models.map((model) => (model.id === modelId ? { ...model, ...patch } : model))
    });
  }

  function updateModelProvider(model: ModelProfile, provider: ModelProvider) {
    const patch: Partial<ModelProfile> = { provider };
    if (provider === "claude-agent") {
      if (!model.baseUrl.trim() || model.baseUrl.trim() === "https://api.openai.com") {
        patch.baseUrl = "https://api.anthropic.com";
      }
      if (!model.model.trim() || model.model.startsWith("gpt-")) {
        patch.model = "claude-sonnet-4-6";
      }
    }
    if (provider === "openai-compatible" && model.model.startsWith("claude-")) {
      patch.model = "gpt-4.1-mini";
    }
    updateModel(model.id, patch);
  }

  async function saveModel(model: ModelProfile) {
    await update(upsertModelProfile(settings, model));
  }

  async function testModel(model: ModelProfile) {
    setTestingModelId(model.id);
    setTestMessage(undefined);
    try {
      await onTestModel(model);
      setTestMessage(`${model.name} 连接成功`);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : `${model.name} 连接失败`);
    } finally {
      setTestingModelId(undefined);
    }
  }

  async function checkUpdates() {
    setCheckingNetwork(true);
    setNetworkMessage(undefined);
    try {
      await onSave(ensureProjects(ensureModelProfiles(settings)));
      const result = await onCheckUpdates();
      setUpdateStatus(result.status);
      setAvailableUpdateVersion(result.status === "available" ? result.version : undefined);
      setNetworkMessage(result.message ?? (result.status === "available" ? `发现新版本 ${result.version}` : "更新检查完成。"));
    } catch (error) {
      setUpdateStatus("error");
      setNetworkMessage(error instanceof Error ? error.message : "检查更新失败。");
    } finally {
      setCheckingNetwork(false);
    }
  }

  async function downloadUpdate() {
    setCheckingNetwork(true);
    setNetworkMessage("正在下载更新，请稍候。");
    try {
      await onSave(ensureProjects(ensureModelProfiles(settings)));
      const result = await onDownloadUpdate();
      setUpdateStatus(result.status);
      setNetworkMessage(result.message ?? "更新已下载，点击重启安装即可完成更新。");
    } catch (error) {
      setUpdateStatus("error");
      setNetworkMessage(error instanceof Error ? error.message : "下载更新失败。");
    } finally {
      setCheckingNetwork(false);
    }
  }

  async function installUpdate() {
    setCheckingNetwork(true);
    setNetworkMessage("正在重启并安装更新。");
    try {
      const result = await onInstallUpdate();
      setUpdateStatus(result.status);
      setNetworkMessage(result.message ?? "正在重启并安装更新。");
    } catch (error) {
      setUpdateStatus("error");
      setNetworkMessage(error instanceof Error ? error.message : "安装更新失败。");
      setCheckingNetwork(false);
    }
  }

  async function checkNotices() {
    setCheckingNetwork(true);
    setNetworkMessage(undefined);
    try {
      await onSave(ensureProjects(ensureModelProfiles(settings)));
      const result = await onCheckNotices();
      const firstNotice = result.notices[0];
      setNetworkMessage(firstNotice ? `${firstNotice.title}：${firstNotice.message}` : result.message ?? "暂无新公告。");
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "检查公告失败。");
    } finally {
      setCheckingNetwork(false);
    }
  }

  async function runChannelAction(
    provider: ChannelProvider,
    action: (provider: ChannelProvider) => Promise<ChannelAdapterResult>
  ) {
    setChannelBusyProvider(provider);
    setChannelMessage(undefined);
    try {
      const result = await action(provider);
      setChannelMessage(result.message);
    } catch (error) {
      setChannelMessage(error instanceof Error ? error.message : "通道操作失败。");
    } finally {
      setChannelBusyProvider(undefined);
    }
  }

  async function updateChannel(provider: ChannelProvider, patch: Partial<ChannelSettings>) {
    await update({
      ...settings,
      channels: settings.channels.map((channel) => channel.provider === provider ? { ...channel, ...patch } : channel)
    });
  }

  function updateChannelDraft(provider: ChannelProvider, patch: Partial<ChannelSettings>) {
    setSettings({
      ...settings,
      channels: settings.channels.map((channel) => channel.provider === provider ? { ...channel, ...patch } : channel)
    });
  }

  function updateFeishuDraft(provider: ChannelProvider, patch: Partial<NonNullable<ChannelSettings["feishu"]>>) {
    setSettings({
      ...settings,
      channels: settings.channels.map((channel) => channel.provider === provider
        ? { ...channel, feishu: { appId: "", appSecret: "", connectionMode: "websocket", ...channel.feishu, ...patch } }
        : channel)
    });
  }

  function updateWechatDraft(provider: ChannelProvider, patch: Partial<NonNullable<ChannelSettings["wechat"]>>) {
    setSettings({
      ...settings,
      channels: settings.channels.map((channel) => channel.provider === provider
        ? {
          ...channel,
          wechat: {
            bridgeUrl: "http://127.0.0.1:18011",
            pluginCommand: "openclaw channels login --channel openclaw-weixin --verbose",
            ...channel.wechat,
            ...patch
          }
        }
        : channel)
    });
  }

  async function addModel() {
    const id = `model-${Date.now().toString(36)}`;
    setSelectedModelId(id);
    await update(upsertModelProfile(settings, {
      id,
      name: `模型 ${settings.models.length + 1}`,
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      model: "gpt-4.1-mini",
      systemPrompt: "You are HaJiMi, a friendly desktop pet."
    }));
  }

  async function removeModel(modelId: string) {
    if (settings.models.length <= 1) {
      return;
    }
    const models = settings.models.filter((model) => model.id !== modelId);
    const petModelBindings = Object.fromEntries(
      Object.entries(settings.petModelBindings ?? {}).filter(([, boundModelId]) => boundModelId !== modelId)
    );
    if (selectedModelId === modelId) {
      setSelectedModelId(models[0].id);
    }
    await update(ensureModelProfiles({
      ...settings,
      models,
      petModelBindings,
      activeChatModelId: settings.activeChatModelId === modelId ? models[0].id : settings.activeChatModelId,
      activeAgentModelId: settings.activeAgentModelId === modelId ? models[0].id : settings.activeAgentModelId
    }));
  }

  async function updatePetModelBinding(petId: string, modelId: string) {
    const petModelBindings = { ...(settings.petModelBindings ?? {}) };
    if (modelId) {
      petModelBindings[petId] = modelId;
    } else {
      delete petModelBindings[petId];
    }
    await update(ensureModelProfiles({
      ...settings,
      petModelBindings
    }));
  }

  async function togglePet(petId: string) {
    const activePetIds = toggleActivePetId(settings.activePetIds, petId);
    await update({
      ...settings,
      activePetId: activePetIds[0],
      activePetIds
    });
  }

  function startRenamePet(petId: string, displayName: string) {
    setRenamingPetId(petId);
    setRenamingPetName(displayName);
  }

  async function finishRenamePet(petId: string) {
    if (petId === "xiaomi") {
      cancelRenamePet();
      return;
    }
    const displayName = renamingPetName.trim();
    if (!displayName) {
      cancelRenamePet();
      return;
    }

    setRenamingPetId(undefined);
    setRenamingPetName("");
    await update({
      ...settings,
      petDisplayNames: {
        ...settings.petDisplayNames,
        [petId]: displayName
      }
    });
  }

  function cancelRenamePet() {
    setRenamingPetId(undefined);
    setRenamingPetName("");
  }

  async function deletePet(petId: string) {
    if (petId === "xiaomi") {
      return;
    }
    if (renamingPetId === petId) {
      cancelRenamePet();
    }
    await onDeletePet(petId);
  }

  async function updatePermissionMode(permissionMode: AgentPermissionMode) {
    await update({
      ...settings,
      agent: {
        ...settings.agent,
        permissionMode,
        allowCommands: permissionMode !== "default"
      }
    });
  }

  async function updateAgentModel(modelId: string) {
    await update({ ...settings, activeAgentModelId: modelId });
  }

  async function switchConversation(conversationId: string) {
    setSettings({ ...settings, activeConversationId: conversationId });
    await onSwitchConversation(conversationId);
  }

  async function switchProjectFromRail(projectId: string) {
    setCollapsedProjectIds((projectIds) => projectIds.filter((item) => item !== projectId));
    await onSwitchProject(projectId);
  }

  function toggleProjectCollapsed(projectId: string) {
    setCollapsedProjectIds((projectIds) =>
      projectIds.includes(projectId)
        ? projectIds.filter((item) => item !== projectId)
        : [...projectIds, projectId]
    );
  }

  function startRenameConversation(conversationId: string, title: string) {
    setRenamingConversationId(conversationId);
    setRenamingTitle(title);
  }

  async function finishRenameConversation(conversationId: string) {
    const title = renamingTitle.trim();
    if (!title) {
      cancelRenameConversation();
      return;
    }

    setRenamingConversationId(undefined);
    setRenamingTitle("");
    setSettings({
      ...settings,
      conversations: settings.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, title } : conversation
      )
    });
    await onRenameConversation(conversationId, title);
  }

  function cancelRenameConversation() {
    setRenamingConversationId(undefined);
    setRenamingTitle("");
  }

  async function deleteConversationFromRail(conversationId: string) {
    if (renamingConversationId === conversationId) {
      cancelRenameConversation();
    }
    await onDeleteConversation(conversationId);
  }

  async function copyOfficeMessage(message: ChatMessage) {
    await writeClipboard(message.displayContent ?? message.content);
  }

  function editOfficeMessage(message: ChatMessage) {
    setOfficeDraft(message.displayContent ?? message.content);
    requestAnimationFrame(() => officeDraftInputRef.current?.focus());
  }

  function renderConversationRow(conversation: PetConversation) {
    return (
      <div
        className={conversation.id === settings.activeConversationId ? "codex-conversation-row active" : "codex-conversation-row"}
        key={conversation.id}
      >
        {renamingConversationId === conversation.id ? (
          <form
            className="codex-conversation-rename"
            onSubmit={(event) => {
              event.preventDefault();
              void finishRenameConversation(conversation.id);
            }}
          >
            <input
              autoFocus
              value={renamingTitle}
              onChange={(event) => setRenamingTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRenameConversation();
                }
              }}
            />
            <button type="submit" title="保存名称">
              <Check size={14} />
            </button>
            <button type="button" title="取消" onClick={cancelRenameConversation}>
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            <button className="codex-conversation-main" onClick={() => void switchConversation(conversation.id)}>
              <span>{conversation.title}</span>
              <small>{conversation.messages.length} 条消息</small>
            </button>
            <div className="codex-conversation-actions">
              <button title="重命名会话" onClick={() => startRenameConversation(conversation.id, conversation.title)}>
                <Pencil size={13} />
              </button>
              <button title="删除会话" onClick={() => void deleteConversationFromRail(conversation.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  async function submitOfficeMessage(event: FormEvent) {
    event.preventDefault();
    const content = officeDraft.trim();
    if ((!content && pendingOfficeAttachments.length === 0) || sendingOfficeMessage) {
      return;
    }
    const message = pendingOfficeAttachments.length > 0
      ? buildAttachmentMessage(content, pendingOfficeAttachments)
      : { role: "user" as const, content };
    setOfficeDraft("");
    setPendingOfficeAttachments([]);
    setSendingOfficeMessage(true);
    try {
      await onSendOfficeMessage(message);
    } finally {
      setSendingOfficeMessage(false);
    }
  }

  async function sendOfficeFile(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (sendingOfficeMessage) {
      return;
    }
    await addOfficeFiles(files);
  }

  async function addOfficeFiles(fileList: FileList | File[] | null | undefined) {
    const files = Array.from(fileList ?? []);
    if (!files.length) {
      return;
    }
    const nextAttachments = await Promise.all(files.map((file) => fileToPromptAttachment(file)));
    setPendingOfficeAttachments((current) => [...current, ...nextAttachments]);
  }

  function removeOfficeAttachment(id: string) {
    setPendingOfficeAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleOfficeDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    setOfficeDragActive(true);
  }

  function handleOfficeDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setOfficeDragActive(false);
  }

  async function handleOfficeDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length) {
      return;
    }
    event.preventDefault();
    setOfficeDragActive(false);
    await addOfficeFiles(event.dataTransfer.files);
  }

  const activeConversation =
    settings.conversations.find((item) => item.id === settings.activeConversationId) ?? settings.conversations[0];
  const messages = activeConversation?.messages ?? [];
  const activeProject = settings.projects.find((project) => project.id === settings.activeProjectId);
  const projectName = activeProject?.name || settings.agent.workspaceDir.split(/[\\/]/).filter(Boolean).at(-1) || "选择项目";
  const visibleConversations = settings.conversations.filter(
    (conversation) => (conversation.projectId || "") === (settings.activeProjectId || "")
  );
  const activePermission = permissionOptions.find((option) => option.id === settings.agent.permissionMode)
    ?? permissionOptions[0];
  const activeAgentModel = settings.models.find((model) => model.id === settings.activeAgentModelId) ?? settings.models[0];
  const activeAgentModelName = activeAgentModel?.name || "默认模型";
  const openAiCompatibleModels = settings.models.filter((model) => model.provider === "openai-compatible");
  const claudeAgentModels = settings.models.filter((model) => model.provider === "claude-agent");
  const selectedModel = settings.models.find((model) => model.id === selectedModelId) ?? settings.models[0];

  useEffect(() => {
    if (section !== "office") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const messageList = messageListRef.current;
      if (!messageList) {
        return;
      }
      messageList.scrollTop = messageList.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [section, activeConversation?.id, messages.length, messages.at(-1)?.content, sendingOfficeMessage, chatError]);

  return (
    <main className="manager-app-shell">
      <aside className="codex-sidebar">
        <section className="codex-sidebar-section">
          <div className="codex-sidebar-heading">
            <p className="codex-sidebar-label">项目</p>
            <button title="选择新项目" onClick={() => void chooseWorkspace()}>
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
                  <button className="codex-project-row active" onClick={() => void chooseWorkspace()}>
                    <FolderOpen size={15} />
                    <span>{projectName}</span>
                  </button>
                  <button className="codex-project-new-conversation" title="新建会话" onClick={() => void onCreateConversation("chat")}>
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
                      onClick={() => toggleProjectCollapsed(project.id)}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button className="codex-project-row" onClick={() => void switchProjectFromRail(project.id)}>
                      <FolderOpen size={15} />
                      <span>{project.name}</span>
                    </button>
                    {active && (
                      <button
                        className="codex-project-new-conversation"
                        title="新建会话"
                        onClick={() => void onCreateConversation("chat")}
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
          <p className="codex-project-path">{activeProject?.path || settings.agent.workspaceDir || "暂无项目"}</p>
        </section>

        <nav className="codex-sidebar-nav" aria-label="管理">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={section === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setSection(item.id)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {section === "office" && (
        <section
          className={officeDragActive ? "codex-chat-main composer-drop-active" : "codex-chat-main"}
          onDragOver={handleOfficeDragOver}
          onDragLeave={handleOfficeDragLeave}
          onDrop={(event) => void handleOfficeDrop(event)}
        >
          <div className="codex-message-scroll" ref={messageListRef}>
            {messages.length === 0 && (
              <div className="codex-empty-state">
                <Bot size={40} />
                <p>{activeAgentModel?.provider === "claude-agent" ? "让哈基Mi处理当前项目里的事。" : "和哈基Mi聊聊当前项目。"}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <article className={message.role === "user" ? "codex-message user" : "codex-message assistant"} key={index}>
                {message.role === "assistant" && message.durationMs !== undefined && (
                  <span className="codex-message-meta">{formatProcessingTime(message.durationMs)}</span>
                )}
                <p>{message.displayContent ?? message.content}</p>
                {message.fileOutputs?.length ? (
                  <div className="composer-output-files">
                    {message.fileOutputs.map((file) => (
                      <span className="composer-output-file" key={`${file.path}-${file.size ?? 0}`}>
                        <Paperclip size={12} />
                        <span>{file.name || file.path}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="message-action-row">
                  <button type="button" title="复制" onClick={() => void copyOfficeMessage(message)}>
                    <Copy size={13} />
                  </button>
                  <button type="button" title="编辑" onClick={() => editOfficeMessage(message)}>
                    <Pencil size={13} />
                  </button>
                </div>
              </article>
            ))}
            {sendingOfficeMessage && (
              <article className="codex-message assistant">
                <span className="codex-message-meta">{formatProcessingTime(officeElapsedMs)}</span>
                <p>收到，正在处理...</p>
              </article>
            )}
            {chatError && (
              <article className="codex-message error">
                <p>{chatError}</p>
              </article>
            )}
          </div>

          <form
            className={officeDragActive ? "codex-composer composer-drop-active" : "codex-composer"}
            onSubmit={submitOfficeMessage}
          >
            {pendingOfficeAttachments.length > 0 && (
              <div className="composer-attachments">
                {pendingOfficeAttachments.map((attachment) => (
                  <span className="composer-attachment" key={attachment.id}>
                    <Paperclip size={12} />
                    <span>{attachment.name}</span>
                    <button type="button" title="移除附件" onClick={() => removeOfficeAttachment(attachment.id)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={officeDraftInputRef}
              value={officeDraft}
              disabled={sendingOfficeMessage}
              placeholder={sendingOfficeMessage ? "发送中..." : activeAgentModel?.provider === "claude-agent" ? "要求后续变更" : "和哈基Mi聊聊当前项目"}
              onChange={(event) => setOfficeDraft(event.target.value)}
            />
            <div className="codex-composer-toolbar">
              <input
                ref={officeFileInputRef}
                className="hidden-file-input"
                type="file"
                multiple
                onChange={(event) => void sendOfficeFile(event)}
              />
              <button type="button" title="发送文件" onClick={() => officeFileInputRef.current?.click()}>
                <Paperclip size={17} />
              </button>
              <select
                className="composer-permission-select"
                value={settings.agent.permissionMode}
                title={activePermission.description}
                onChange={(event) => void updatePermissionMode(event.target.value as AgentPermissionMode)}
              >
                {permissionOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <div className="composer-model-picker" ref={modelMenuRef}>
                <button
                  className="composer-model-select"
                  type="button"
                  title={activeAgentModel ? `当前模型：${activeAgentModel.name} · ${providerLabel(activeAgentModel.provider)}` : "选择模型"}
                  aria-expanded={modelMenuOpen}
                  onClick={() => setModelMenuOpen((open) => !open)}
                >
                  <span>{activeAgentModelName}</span>
                  <ChevronDown size={13} />
                </button>
                {modelMenuOpen && (
                  <div className="composer-model-menu">
                    {openAiCompatibleModels.length > 0 && (
                      <div className="composer-model-group">
                        <span>OpenAI 兼容</span>
                        {openAiCompatibleModels.map((model) => (
                          <button
                            className={model.id === settings.activeAgentModelId ? "active" : ""}
                            key={model.id}
                            type="button"
                            onClick={() => {
                              setModelMenuOpen(false);
                              void updateAgentModel(model.id);
                            }}
                          >
                            <span>{model.name}</span>
                            {model.id === settings.activeAgentModelId && <Check size={13} />}
                          </button>
                        ))}
                      </div>
                    )}
                    {claudeAgentModels.length > 0 && (
                      <div className="composer-model-group">
                        <span>Claude Agent SDK</span>
                        {claudeAgentModels.map((model) => (
                          <button
                            className={model.id === settings.activeAgentModelId ? "active" : ""}
                            key={model.id}
                            type="button"
                            onClick={() => {
                              setModelMenuOpen(false);
                              void updateAgentModel(model.id);
                            }}
                          >
                            <span>{model.name}</span>
                            {model.id === settings.activeAgentModelId && <Check size={13} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                title="删除当前会话"
                disabled={settings.conversations.length <= 1 || !activeConversation}
                onClick={() => activeConversation && void onDeleteConversation(activeConversation.id)}
              >
                <Trash2 size={16} />
              </button>
              <button
                className={sendingOfficeMessage ? "codex-send-button stop" : "codex-send-button"}
                title={sendingOfficeMessage ? "停止生成" : "发送"}
                type={sendingOfficeMessage ? "button" : "submit"}
                disabled={!sendingOfficeMessage && !officeDraft.trim() && pendingOfficeAttachments.length === 0}
                onClick={sendingOfficeMessage ? () => void onCancelMessage() : undefined}
              >
                {sendingOfficeMessage ? <Square size={13} /> : <Send size={17} />}
              </button>
            </div>
          </form>
        </section>
      )}

      {section === "pets" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">哈基Mi</p>
              <h1>宠物</h1>
            </div>
            <button className="primary-command" onClick={() => void onImport()}>
              <Download size={18} />
              导入宠物
            </button>
          </header>
          <div className="manager-grid">
            <div className="manager-section pet-library">
              <div className="section-title">
                <Bot size={18} />
                <span>宠物库</span>
              </div>
              <p className="manager-note">最多同时启用两只宠物。再选第三只会替换最早启用的一只。</p>
              <div className="pet-grid">
                {state.pets.map((pet) => {
                  const active = settings.activePetIds.includes(pet.id);
                  const builtinPet = pet.id === "xiaomi";
                  return (
                    <div className={active ? "pet-tile active" : "pet-tile"} key={pet.id}>
                      <button className="pet-tile-main" onClick={() => void togglePet(pet.id)}>
                        <span className="pet-thumbnail" style={{ backgroundImage: `url("${pet.spritesheetUrl}")` }} aria-hidden="true" />
                        <strong>{pet.displayName}</strong>
                        <span>{active ? "已启用" : pet.id}</span>
                      </button>
                      <label className="pet-brain-binding">
                        <span>大脑模型</span>
                        <select
                          className="pet-model-select"
                          value={settings.petModelBindings?.[pet.id] ?? ""}
                          onChange={(event) => void updatePetModelBinding(pet.id, event.target.value)}
                        >
                          <option value="">跟随当前会话</option>
                          {settings.models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!builtinPet && renamingPetId === pet.id ? (
                        <form
                          className="pet-rename-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void finishRenamePet(pet.id);
                          }}
                        >
                          <input
                            autoFocus
                            value={renamingPetName}
                            onChange={(event) => setRenamingPetName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRenamePet();
                              }
                            }}
                          />
                          <button type="submit" title="保存名称">
                            <Check size={14} />
                          </button>
                          <button type="button" title="取消" onClick={cancelRenamePet}>
                            <X size={14} />
                          </button>
                        </form>
                      ) : !builtinPet && (
                        <div className="pet-tile-actions">
                          <button title="重命名宠物" onClick={() => startRenamePet(pet.id, pet.displayName)}>
                            <Pencil size={14} />
                          </button>
                          <button title="删除导入宠物" onClick={() => void deletePet(pet.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="manager-section">
              <div className="section-title">
                <Sparkles size={18} />
                <span>自然行为</span>
              </div>
              <label className="manager-toggle">
                <span>自主走动/奔跑</span>
                <input
                  type="checkbox"
                  checked={settings.movementEnabled}
                  onChange={(event) => void update({ ...settings, movementEnabled: event.target.checked })}
                />
              </label>
              <label className="manager-toggle">
                <span>多宠物一起玩耍</span>
                <input
                  type="checkbox"
                  checked={settings.playTogetherEnabled}
                  onChange={(event) => void update({ ...settings, playTogetherEnabled: event.target.checked })}
                />
              </label>
              <label>
                活跃度
                <select
                  value={settings.movementIntensity}
                  onChange={(event) =>
                    void update({ ...settings, movementIntensity: event.target.value as AppSettings["movementIntensity"] })
                  }
                >
                  <option value="calm">安静</option>
                  <option value="normal">自然</option>
                  <option value="lively">活泼</option>
                </select>
              </label>
              <label>
                宠物大小
                <input
                  type="range"
                  min="0.5"
                  max="1.4"
                  step="0.05"
                  value={settings.petScale}
                  onChange={(event) => setSettings({ ...settings, petScale: Number(event.target.value) })}
                  onMouseUp={() => void save()}
                  onTouchEnd={() => void save()}
                />
              </label>
            </div>
          </div>
        </section>
      )}

      {section === "models" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">哈基Mi</p>
              <h1>模型配置</h1>
            </div>
          </header>
          <div className="model-manager-layout">
            <aside className="model-index-panel">
              <div className="model-index-heading">
                <span>模型列表</span>
                <button title="新增模型" onClick={() => void addModel()}>
                  <Plus size={15} />
                </button>
              </div>
              <div className="model-index-list">
                {settings.models.map((model) => (
                  <button
                    className={model.id === selectedModel?.id ? "model-index-row active" : "model-index-row"}
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                  >
                    <strong>{model.name}</strong>
                    <span>{providerLabel(model.provider)} · {model.model || "未填写模型"}</span>
                    <small>{model.baseUrl || "未填写网关"}</small>
                  </button>
                ))}
              </div>
            </aside>

            {selectedModel && (
              <div className="model-detail-card">
                <div className="model-card-title">
                  <input value={selectedModel.name} onChange={(event) => updateModel(selectedModel.id, { name: event.target.value })} />
                  <button title="删除模型" disabled={settings.models.length <= 1} onClick={() => void removeModel(selectedModel.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <label>
                  提供方
                  <select
                    value={selectedModel.provider}
                    title={providerOptions.find((option) => option.id === selectedModel.provider)?.description}
                    onChange={(event) => updateModelProvider(selectedModel, event.target.value as ModelProvider)}
                  >
                    {providerOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  API Base URL / 网关 URL
                  <input value={selectedModel.baseUrl} onChange={(event) => updateModel(selectedModel.id, { baseUrl: event.target.value })} />
                </label>
                <label>
                  API Key
                  <input
                    type="password"
                    value={selectedModel.apiKey}
                    onChange={(event) => updateModel(selectedModel.id, { apiKey: event.target.value })}
                  />
                </label>
                <label>
                  Model
                  <input value={selectedModel.model} onChange={(event) => updateModel(selectedModel.id, { model: event.target.value })} />
                </label>
                <label>
                  System Prompt
                  <textarea value={selectedModel.systemPrompt} onChange={(event) => updateModel(selectedModel.id, { systemPrompt: event.target.value })} />
                </label>
                <div className="model-actions">
                  <button className="secondary-command" onClick={() => void saveModel(selectedModel)}>保存</button>
                  <button className="secondary-command" onClick={() => void testModel(selectedModel)}>
                    {testingModelId === selectedModel.id ? "测试中" : "测试连接"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {testMessage && <p className="save-state">{testMessage}</p>}
        </section>
      )}

      {section === "channels" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">哈基Mi</p>
              <h1>通道</h1>
              <p>把飞书和微信消息接入哈基Mi，远程聊天也能进入当前办公能力。</p>
            </div>
          </header>
          <div className="channel-grid">
            {settings.channels.map((channel) => (
              <div className="manager-section channel-card" key={channel.provider}>
                <div className="section-title">
                  <MessageCircle size={18} />
                  <span>{channel.provider === "feishu" ? "飞书机器人" : "微信插件"}</span>
                </div>
                <label className="manager-toggle">
                  <span>启用</span>
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    onChange={(event) => void updateChannel(channel.provider, { enabled: event.target.checked })}
                  />
                </label>
                <label>
                  默认路由
                  <select
                    value={channel.routeMode}
                    onChange={(event) => void updateChannel(channel.provider, { routeMode: event.target.value as ChannelSettings["routeMode"] })}
                  >
                    <option value="chat">聊天</option>
                    <option value="agent">办公区</option>
                  </select>
                </label>
                <label>
                  访问控制
                  <select
                    value={channel.accessMode}
                    onChange={(event) =>
                      void updateChannel(channel.provider, { accessMode: event.target.value as ChannelSettings["accessMode"] })
                    }
                  >
                    <option value="pairing">配对后允许</option>
                    <option value="allowlist">仅白名单</option>
                  </select>
                </label>
                {channel.provider === "feishu" ? (
                  <>
                    <label>
                      App ID
                      <input
                        value={channel.feishu?.appId ?? ""}
                        onChange={(event) => updateFeishuDraft(channel.provider, { appId: event.target.value })}
                        onBlur={() => void save()}
                      />
                    </label>
                    <label>
                      App Secret
                      <input
                        type="password"
                        value={channel.feishu?.appSecret ?? ""}
                        onChange={(event) => updateFeishuDraft(channel.provider, { appSecret: event.target.value })}
                        onBlur={() => void save()}
                      />
                    </label>
                    <p className="manager-note">使用飞书自建应用和 WebSocket 长连接事件订阅。需要事件：im.message.receive_v1。</p>
                  </>
                ) : (
                  <>
                    <label>
                      桥接地址
                      <input
                        value={channel.wechat?.bridgeUrl ?? ""}
                        onChange={(event) => updateWechatDraft(channel.provider, { bridgeUrl: event.target.value })}
                        onBlur={() => void save()}
                      />
                    </label>
                    <label>
                      插件命令
                      <input
                        value={channel.wechat?.pluginCommand ?? ""}
                        onChange={(event) => updateWechatDraft(channel.provider, { pluginCommand: event.target.value })}
                        onBlur={() => void save()}
                      />
                    </label>
                    <p className="manager-note">已内置微信官方 ClawBot 插件和 OpenClaw 运行文件。点击启动会打开终端准备插件并展示二维码。</p>
                  </>
                )}
                <div className="channel-steps">
                  {openClawSetupSteps(channel).map((step, index) => (
                    <div className="channel-step" key={`${channel.provider}-${index}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        {step.command && <code>{step.command}</code>}
                        {step.note && <small>{step.note}</small>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="channel-status-row">
                  <span>状态</span>
                  <strong>{channel.status}</strong>
                </div>
                <div className="network-actions">
                  <button
                    className="secondary-command"
                    disabled={channelBusyProvider === channel.provider}
                    onClick={() => void runChannelAction(channel.provider, onStartChannel)}
                  >
                    {channel.provider === "wechat" ? "安装/扫码" : "启动通道"}
                  </button>
                  <button
                    className="secondary-command"
                    disabled={channelBusyProvider === channel.provider}
                    onClick={() => void runChannelAction(channel.provider, onTestChannel)}
                  >
                    测试通道
                  </button>
                  <button
                    className="secondary-command"
                    disabled={channelBusyProvider === channel.provider}
                    onClick={() => void runChannelAction(channel.provider, onStopChannel)}
                  >
                    停止通道
                  </button>
                </div>
                <p className="manager-note">已允许来源：{channel.allowedPeers.length} 个</p>
              </div>
            ))}
          </div>
          {channelMessage && <p className="save-state">{channelMessage}</p>}
        </section>
      )}

      {section === "system" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">哈基Mi</p>
              <h1>系统</h1>
            </div>
          </header>
          <div className="manager-grid">
            <div className="manager-section">
              <div className="section-title">
                <Sparkles size={18} />
                <span>心跳气泡</span>
              </div>
              <label className="manager-toggle">
                <span>定时问候</span>
                <input
                  type="checkbox"
                  checked={settings.heartbeat.enabled}
                  onChange={(event) =>
                    void update({ ...settings, heartbeat: { ...settings.heartbeat, enabled: event.target.checked } })
                  }
                />
              </label>
              <label className="manager-toggle">
                <span>使用模型自由问候</span>
                <input
                  type="checkbox"
                  checked={settings.heartbeat.modelGreetingEnabled}
                  onChange={(event) =>
                    void update({
                      ...settings,
                      heartbeat: { ...settings.heartbeat, modelGreetingEnabled: event.target.checked }
                    })
                  }
                />
              </label>
              <label className="manager-toggle">
                <span>忙碌时自动收成气泡</span>
                <input
                  type="checkbox"
                  checked={settings.heartbeat.collapseToBubbleEnabled}
                  onChange={(event) =>
                    void update({
                      ...settings,
                      heartbeat: { ...settings.heartbeat, collapseToBubbleEnabled: event.target.checked }
                    })
                  }
                />
              </label>
            </div>
            <div className="manager-section">
              <div className="section-title">
                <ShieldCheck size={18} />
                <span>运行边界</span>
              </div>
              <p className="manager-note">办公区就是一个项目，文件读取、搜索、写入都会限制在这个项目目录内。</p>
              <p className="manager-note">权限和模型选择现在放在办公区底部输入栏里。</p>
              {saving && <p className="save-state">保存中</p>}
            </div>
            <div className="manager-section network-section">
              <div className="section-title">
                <RefreshCw size={18} />
                <span>联网更新与公告</span>
              </div>
              <label className="manager-toggle">
                <span>启动后自动检查</span>
                <input
                  type="checkbox"
                  checked={settings.network.autoCheckEnabled}
                  onChange={(event) =>
                    void update({
                      ...settings,
                      network: { ...settings.network, autoCheckEnabled: event.target.checked }
                    })
                  }
                />
              </label>
              <label>
                更新源 URL
                <input
                  value={settings.network.updateFeedUrl}
                  placeholder="https://github.com/mingcongl884-ux/hajimi-pet-windows/releases/latest/download"
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      network: { ...settings.network, updateFeedUrl: event.target.value }
                    })
                  }
                  onBlur={() => void save()}
                />
              </label>
              <label>
                公告 JSON URL
                <input
                  value={settings.network.noticeFeedUrl}
                  placeholder="https://raw.githubusercontent.com/mingcongl884-ux/hajimi-pet-windows/main/notices.json"
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      network: { ...settings.network, noticeFeedUrl: event.target.value }
                    })
                  }
                  onBlur={() => void save()}
                />
              </label>
              <div className="network-actions">
                <button className="secondary-command" disabled={checkingNetwork} onClick={() => void checkUpdates()}>
                  <RefreshCw size={16} />
                  检查更新
                </button>
                {updateStatus === "available" && (
                  <button className="secondary-command" disabled={checkingNetwork} onClick={() => void downloadUpdate()}>
                    <Download size={16} />
                    下载更新{availableUpdateVersion ? ` ${availableUpdateVersion}` : ""}
                  </button>
                )}
                {updateStatus === "downloaded" && (
                  <button className="primary-command compact-command" disabled={checkingNetwork} onClick={() => void installUpdate()}>
                    <Check size={16} />
                    重启安装
                  </button>
                )}
                <button className="secondary-command" disabled={checkingNetwork} onClick={() => void checkNotices()}>
                  <MessageCircle size={16} />
                  检查公告
                </button>
              </div>
              {networkMessage && <p className="save-state">{networkMessage}</p>}
              <p className="manager-note">更新源使用 electron-updater 的 generic 格式；公告源支持数组或 {"{ notices: [...] }"}。</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const element = document.createElement("textarea");
  element.value = text;
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();
  document.execCommand("copy");
  element.remove();
}

function formatProcessingTime(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `已处理 ${seconds}s`;
  }
  return `已处理 ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
