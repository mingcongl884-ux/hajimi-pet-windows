import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import type { ChannelAdapterResult } from "../../electron/channelAdapters";
import type { ChatMessage } from "../../electron/chatClient";
import type { UpdateCheckResult } from "../../electron/networkClient";
import type { RemoteBridgeDiscoveryResult } from "../../electron/remoteBridgeDiscovery";
import type { AgentPermissionMode, AppSettings, ModelProfile, ModelProvider, PetConversation, PetConversationMode } from "../../electron/settingsStore";
import type { RemoteNotice } from "../../electron/settingsStore";
import type { PetAppState } from "../global";
import { toggleActivePetId } from "../lib/activePets";
import { openClawSetupSteps, type ChannelProvider, type ChannelSettings } from "../lib/channels";
import { ensureProjects } from "../lib/projects";
import {
  describeRemoteBridgeTarget,
  ensureRemoteBridgeSettings,
  summarizeRemoteBridgeStatus,
  type RemoteKnownHost
} from "../lib/remoteBridge";
import { buildAttachmentMessage, fileToPromptAttachment, type PromptAttachment } from "../lib/fileMessage";
import { ensureModelProfiles, upsertModelProfile } from "../lib/modelProfiles";
import { capabilityStatusLabel, summarizeCapabilities, type CapabilityCheckResult } from "../lib/capabilityCheck";
import { buildProjectMemorySuggestion, type ProjectMemorySuggestion } from "../lib/projectMemory";
import { buildOutputArtifacts, formatOutputArtifactHeader } from "../lib/outputArtifacts";
import type { ManagedSkill, OfficeSkillRequest, SkillScope } from "../lib/skills";
import {
  formatTaskElapsed,
  formatTaskStatus
} from "../lib/taskCards";
import {
  cancelOfficeTask,
  completeOfficeTask,
  createOfficeTaskState,
  failOfficeTask,
  startOfficeTask
} from "../lib/officeTaskState";
import ManagerSidebar, { type ManagerSection, type SettingsTab } from "./ManagerSidebar";

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
  onSendOfficeMessage(message: ChatMessage, modelId?: string, skillRequest?: OfficeSkillRequest): Promise<void>;
  onCancelMessage(): Promise<void> | void;
};

const permissionOptions: Array<{ id: AgentPermissionMode; label: string; description: string }> = [
  { id: "default", label: "默认权限", description: "读写项目文件，命令需要提高权限后执行。" },
  { id: "auto-review", label: "自动审查", description: "自动运行安全命令，拦截明显危险操作。" },
  { id: "full-access", label: "完全访问权限", description: "信任当前项目，允许更完整的办公能力。" }
];

const providerOptions: Array<{ id: ModelProvider; label: string; description: string }> = [
  { id: "openai-compatible", label: "OpenAI 兼容", description: "内置办公工具代理，适合大多数兼容接口。" },
  { id: "claude-agent", label: "Claude Agent SDK", description: "高级办公模式，使用 Claude Code 同源的 Agent SDK 工具循环。" }
];

function providerLabel(provider: ModelProvider) {
  return provider === "claude-agent" ? "Claude Agent SDK" : "OpenAI 兼容";
}

function prepareManagerSettings(settings: AppSettings): AppSettings {
  return ensureProjects(ensureModelProfiles(ensureRemoteBridgeSettings(settings)));
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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState(() => prepareManagerSettings(state.settings));
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<string[]>(() =>
    settings.projects.filter((project) => project.id !== settings.activeProjectId).map((project) => project.id)
  );
  const [saving, setSaving] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string>();
  const [selectedModelId, setSelectedModelId] = useState(state.settings.activeAgentModelId || state.settings.activeChatModelId);
  const [testMessage, setTestMessage] = useState<string>();
  const [skills, setSkills] = useState<ManagedSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
  const [skillsMessage, setSkillsMessage] = useState<string>();
  const [officeDraft, setOfficeDraft] = useState("");
  const [sendingOfficeMessage, setSendingOfficeMessage] = useState(false);
  const [pendingOfficeAttachments, setPendingOfficeAttachments] = useState<PromptAttachment[]>([]);
  const [officeDragActive, setOfficeDragActive] = useState(false);
  const [officeElapsedMs, setOfficeElapsedMs] = useState(1000);
  const [officeTask, setOfficeTask] = useState(() => createOfficeTaskState());
  const [lastFailedOfficeMessage, setLastFailedOfficeMessage] = useState<ChatMessage>();
  const [networkMessage, setNetworkMessage] = useState<string>();
  const [capabilityResult, setCapabilityResult] = useState<CapabilityCheckResult>();
  const [checkingCapabilities, setCheckingCapabilities] = useState(false);
  const [repairingCapabilityId, setRepairingCapabilityId] = useState<string>();
  const [capabilityRepairMessage, setCapabilityRepairMessage] = useState<string>();
  const [projectMemorySuggestion, setProjectMemorySuggestion] = useState<ProjectMemorySuggestion>();
  const [channelMessage, setChannelMessage] = useState<string>();
  const [channelBusyProvider, setChannelBusyProvider] = useState<ChannelProvider>();
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResult["status"]>();
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string>();
  const [remoteBridgeMessage, setRemoteBridgeMessage] = useState<string>();
  const [remoteDiscoveryResults, setRemoteDiscoveryResults] = useState<RemoteBridgeDiscoveryResult[]>([]);
  const [scanningRemoteBridges, setScanningRemoteBridges] = useState(false);
  const [remotePairingAddress, setRemotePairingAddress] = useState("");
  const [remotePairingCode, setRemotePairingCode] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState<string>();
  const [renamingTitle, setRenamingTitle] = useState("");
  const [renamingPetId, setRenamingPetId] = useState<string>();
  const [renamingPetName, setRenamingPetName] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [targetMenuOpen, setTargetMenuOpen] = useState(false);
  const officeFileInputRef = useRef<HTMLInputElement>(null);
  const officeDraftInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const targetMenuRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const officeCancelRequestedRef = useRef(false);
  const activeOfficeTask = officeTask.activeTaskCard;
  const officeTaskStatus = officeTask.status;

  useEffect(() => setSettings(prepareManagerSettings(state.settings)), [state.settings]);
  useEffect(() => {
    const prepared = ensureModelProfiles(state.settings);
    if (!prepared.models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(prepared.activeAgentModelId || prepared.models[0]?.id);
    }
  }, [selectedModelId, state.settings]);
  useEffect(() => {
    void refreshSkills();
  }, []);
  useEffect(() => {
    setCollapsedProjectIds((projectIds) =>
      projectIds.filter((projectId) =>
        projectId !== settings.activeProjectId && settings.projects.some((project) => project.id === projectId)
      )
    );
  }, [settings.activeProjectId, settings.projects]);
  useEffect(() => {
    if (!modelMenuOpen && !permissionMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (modelMenuOpen && !modelMenuRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
      }
      if (permissionMenuOpen && !permissionMenuRef.current?.contains(event.target)) {
        setPermissionMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
        setPermissionMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelMenuOpen, permissionMenuOpen]);
  useEffect(() => {
    if (!targetMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (!targetMenuRef.current?.contains(event.target)) {
        setTargetMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTargetMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [targetMenuOpen]);
  useEffect(() => {
    if (!skillMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !composerRef.current?.contains(event.target)) {
        setSkillMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkillMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [skillMenuOpen]);
  useEffect(() => {
    if (!activeOfficeTask || (activeOfficeTask.phase !== "processing" && activeOfficeTask.phase !== "starting")) {
      setOfficeElapsedMs(1000);
      return;
    }

    const startedAt = activeOfficeTask.startedAt;
    setOfficeElapsedMs(1000);
    const timer = window.setInterval(() => {
      setOfficeElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeOfficeTask?.id, activeOfficeTask?.phase, activeOfficeTask?.startedAt]);

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

  async function refreshSkills() {
    try {
      const nextSkills = await window.petApp.listSkills();
      setSkills(nextSkills);
      setSelectedSkillId((current) => current && nextSkills.some((skill) => skill.id === current)
        ? current
        : nextSkills[0]?.id);
      setSkillsMessage(undefined);
    } catch (error) {
      setSkillsMessage(readUnknownError(error));
    }
  }

  async function importSkill() {
    setSkillsMessage(undefined);
    try {
      const imported = await window.petApp.importSkillFolder();
      await refreshSkills();
      if (imported) {
        setSelectedSkillId(imported.id);
        setSkillsMessage(`已导入 ${imported.name}`);
      }
    } catch (error) {
      setSkillsMessage(readUnknownError(error));
    }
  }

  async function updateSkill(skillId: string, patch: Partial<Pick<ManagedSkill, "enabled" | "scope" | "projectPath">>) {
    setSkillsMessage(undefined);
    try {
      const updatedSkill = await window.petApp.updateSkill(skillId, patch);
      setSkills((current) => current.map((skill) => skill.id === skillId ? updatedSkill : skill));
      setSelectedSkillId(updatedSkill.id);
    } catch (error) {
      setSkillsMessage(readUnknownError(error));
    }
  }

  async function removeSkill(skillId: string) {
    setSkillsMessage(undefined);
    try {
      await window.petApp.removeSkill(skillId);
      setPinnedSkillIds((current) => current.filter((id) => id !== skillId));
      const nextSkills = skills.filter((skill) => skill.id !== skillId);
      setSkills(nextSkills);
      setSelectedSkillId((selected) => selected === skillId ? nextSkills[0]?.id : selected);
    } catch (error) {
      setSkillsMessage(readUnknownError(error));
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

  async function checkCapabilities() {
    setCheckingCapabilities(true);
    setCapabilityRepairMessage(undefined);
    setTestMessage(undefined);
    try {
      await onSave(ensureProjects(ensureModelProfiles(settings)));
      const result = await window.petApp.checkCapabilities();
      setCapabilityResult(result);
      setTestMessage(summarizeCapabilities(result.rows));
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "能力体检失败");
    } finally {
      setCheckingCapabilities(false);
    }
  }

  async function repairCapability(rowId: string, actionId: NonNullable<CapabilityCheckResult["rows"][number]["repair"]>["id"]) {
    setRepairingCapabilityId(rowId);
    setCapabilityRepairMessage(undefined);
    try {
      await onSave(ensureProjects(ensureModelProfiles(settings)));
      const result = await window.petApp.repairCapability(actionId, rowId);
      if (result.result) {
        setCapabilityResult(result.result);
      }
      setCapabilityRepairMessage(result.assistantMessage ? `${result.message}\n${result.assistantMessage}` : result.message);
    } catch (error) {
      setCapabilityRepairMessage(error instanceof Error ? error.message : "故障修复失败");
    } finally {
      setRepairingCapabilityId(undefined);
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

  async function updateRemoteTarget(targetId: string) {
    await update({
      ...settings,
      remoteBridge: {
        ...settings.remoteBridge,
        activeTargetId: targetId
      }
    });
  }

  async function startRemoteBridge() {
    setRemoteBridgeMessage(undefined);
    try {
      await window.petApp.startRemoteBridge();
      setRemoteBridgeMessage("已启动桥接。");
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "启动桥接失败");
    }
  }

  async function stopRemoteBridge() {
    setRemoteBridgeMessage(undefined);
    try {
      await window.petApp.stopRemoteBridge();
      setRemoteBridgeMessage("已停止桥接。");
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "停止桥接失败");
    }
  }

  async function generateRemotePairingCode() {
    setRemoteBridgeMessage(undefined);
    try {
      await window.petApp.generateRemotePairingCode();
      setRemoteBridgeMessage("已生成新的配对码。");
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "生成配对码失败");
    }
  }

  async function revokeRemoteDevice(deviceId: string) {
    setRemoteBridgeMessage(undefined);
    try {
      await window.petApp.revokeRemoteDevice(deviceId);
      if (settings.remoteBridge.activeTargetId === deviceId) {
        await updateRemoteTarget("local");
      }
      setRemoteBridgeMessage("已撤销设备授权。");
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "撤销设备失败");
    }
  }

  async function removeKnownHost(hostId: string) {
    const knownHosts = settings.remoteBridge.knownHosts.filter((host) => host.id !== hostId);
    await update({
      ...settings,
      remoteBridge: {
        ...settings.remoteBridge,
        knownHosts,
        activeTargetId: settings.remoteBridge.activeTargetId === hostId ? "local" : settings.remoteBridge.activeTargetId
      }
    });
  }

  async function connectRemoteHost() {
    const address = remotePairingAddress.trim();
    const pairingCode = remotePairingCode.trim();
    if (!address || !pairingCode) {
      setRemoteBridgeMessage("先填写远端地址和配对码。");
      return;
    }

    setSaving(true);
    setRemoteBridgeMessage(undefined);
    try {
      const response = await fetch(new URL("/pair", normalizeRemoteBridgeAddress(address)).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairingCode,
          deviceName: settings.remoteBridge.deviceName || "HaJiMi"
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json() as {
        deviceId: string;
        name: string;
        token: string;
        permissionMode: RemoteKnownHost["permissionMode"];
        transport?: RemoteKnownHost["transport"];
        relaySessionId?: string;
      };
      const nextHost: RemoteKnownHost = {
        id: payload.deviceId,
        name: payload.name,
        address: normalizeRemoteBridgeAddress(address),
        token: payload.token,
        permissionMode: payload.permissionMode,
        transport: payload.transport ?? "http",
        relaySessionId: payload.relaySessionId
      };
      await update({
        ...settings,
        remoteBridge: {
          ...settings.remoteBridge,
          knownHosts: [
            ...settings.remoteBridge.knownHosts.filter((host) => host.id !== nextHost.id),
            nextHost
          ],
          activeTargetId: nextHost.id
        }
      });
      setTargetMenuOpen(false);
      setRemoteBridgeMessage(`已连接到 ${nextHost.name}。`);
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "连接远端主机失败");
    } finally {
      setSaving(false);
    }
  }

  async function discoverRemoteBridges() {
    setScanningRemoteBridges(true);
    setRemoteBridgeMessage(undefined);
    try {
      const results = await window.petApp.discoverRemoteBridges();
      setRemoteDiscoveryResults(results);
      setRemoteBridgeMessage(results.length ? `发现 ${results.length} 台可连接电脑。` : "没有发现局域网里的哈吉Mi，仍可手动输入地址。");
    } catch (error) {
      setRemoteBridgeMessage(error instanceof Error ? error.message : "扫描局域网失败");
    } finally {
      setScanningRemoteBridges(false);
    }
  }

  function fillRemoteDiscoveredHost(host: RemoteBridgeDiscoveryResult) {
    setRemotePairingAddress(host.address);
    setRemoteBridgeMessage(`${host.name} 已填入地址，输入配对码后连接。`);
  }

  async function switchConversation(conversationId: string) {
    setSection("office");
    setSettings({ ...settings, activeConversationId: conversationId });
    await onSwitchConversation(conversationId);
  }

  async function switchProjectFromRail(projectId: string) {
    setSection("office");
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

  async function openOutputFile(path: string) {
    try {
      await window.petApp.openOutputFile(path);
    } catch (error) {
      setTestMessage(`无法打开文件：${readUnknownError(error)}`);
    }
  }

  async function showOutputFile(path: string) {
    try {
      await window.petApp.showOutputFile(path);
    } catch (error) {
      setTestMessage(`无法定位文件：${readUnknownError(error)}`);
    }
  }

  async function copyOutputPath(path: string) {
    await writeClipboard(path);
    setTestMessage("已复制路径");
  }

  function renderOutputArtifacts(message: ChatMessage) {
    const artifacts = buildOutputArtifacts(message.fileOutputs);
    if (!artifacts.length) {
      return null;
    }
    return (
      <section className="output-artifact-block" aria-label="生成文件">
        <div className="output-artifact-header">{formatOutputArtifactHeader(artifacts.length)}</div>
        <div className="output-artifact-list">
          {artifacts.map((artifact) => (
            <div className="output-artifact-row" key={`${artifact.file.path}-${artifact.file.size ?? 0}`} title={artifact.file.path}>
              <div className="output-artifact-icon">
                <Paperclip size={14} />
              </div>
              <div className="output-artifact-main">
                <strong>{artifact.displayName}</strong>
                <span>
                  {artifact.extensionLabel}
                  {artifact.sizeLabel ? ` · ${artifact.sizeLabel}` : ""}
                  {artifact.locationLabel ? ` · ${artifact.locationLabel}` : ""}
                </span>
              </div>
              <div className="output-artifact-actions">
                <button type="button" title="打开文件" aria-label={`打开文件 ${artifact.displayName}`} onClick={() => void openOutputFile(artifact.file.path)}>
                  <Download size={13} />
                </button>
                <button type="button" title="打开所在文件夹" aria-label={`打开所在文件夹 ${artifact.displayName}`} onClick={() => void showOutputFile(artifact.file.path)}>
                  <FolderOpen size={13} />
                </button>
                <button type="button" title="复制路径" aria-label={`复制路径 ${artifact.displayName}`} onClick={() => void copyOutputPath(artifact.file.path)}>
                  <Copy size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
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

  function handleOfficeDraftChange(value: string) {
    setOfficeDraft(value);
    const slashQuery = readSlashSkillQuery(value);
    setSkillMenuOpen(slashQuery !== undefined);
    if (slashQuery === undefined) {
      setPinnedSkillIds([]);
    }
  }

  function selectComposerSkill(skill: ManagedSkill) {
    const rest = removeSlashSkillPrefix(officeDraft);
    setOfficeDraft(`/${skill.name}${rest ? ` ${rest}` : " "}`);
    setPinnedSkillIds([skill.id]);
    setSkillMenuOpen(false);
    requestAnimationFrame(() => officeDraftInputRef.current?.focus());
  }

  async function submitOfficeMessage(event: FormEvent) {
    event.preventDefault();
    const content = officeDraft.trim();
    if ((!content && pendingOfficeAttachments.length === 0) || sendingOfficeMessage) {
      return;
    }
    const hasAttachments = pendingOfficeAttachments.length > 0;
    const message = hasAttachments
      ? buildAttachmentMessage(content, pendingOfficeAttachments)
      : { role: "user" as const, content };
    await sendPreparedOfficeMessage(message, undefined, hasAttachments, composerSkillRequest);
  }

  async function sendPreparedOfficeMessage(
    message: ChatMessage,
    modelIdOverride?: string,
    forceTaskCard = false,
    skillRequest?: OfficeSkillRequest
  ) {
    if (sendingOfficeMessage) {
      return;
    }
    const taskInput = message.displayContent ?? message.content;
    setOfficeDraft("");
    setSkillMenuOpen(false);
    setPinnedSkillIds([]);
    setPendingOfficeAttachments([]);
    setOfficeTask((current) => startOfficeTask(current, { input: taskInput, hasAttachment: forceTaskCard }));
    setSendingOfficeMessage(true);
    setLastFailedOfficeMessage(undefined);
    officeCancelRequestedRef.current = false;
    try {
      await onSendOfficeMessage(message, modelIdOverride, skillRequest);
      if (officeCancelRequestedRef.current) {
        setOfficeTask((current) => cancelOfficeTask(current));
      } else {
        setOfficeTask((current) => completeOfficeTask(current));
      }
    } catch (error) {
      if (officeCancelRequestedRef.current || isCancelledOfficeError(error)) {
        setOfficeTask((current) => cancelOfficeTask(current));
        return;
      }
      setLastFailedOfficeMessage(message);
      setOfficeTask((current) => failOfficeTask(current, readUnknownError(error)));
    } finally {
      setSendingOfficeMessage(false);
    }
  }

  async function retryOfficeMessage(modelIdOverride?: string) {
    if (!lastFailedOfficeMessage || sendingOfficeMessage) {
      return;
    }
    await sendPreparedOfficeMessage(lastFailedOfficeMessage, modelIdOverride, false, composerSkillRequest);
  }

  async function cancelOfficeMessage() {
    officeCancelRequestedRef.current = true;
    setOfficeTask((current) => cancelOfficeTask(current));
    await onCancelMessage();
  }

  function isCancelledOfficeError(error: unknown) {
    const message = readUnknownError(error);
    return /已停止|cancel|abort/i.test(message);
  }

  function readUnknownError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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
  const remoteBridgeSummary = summarizeRemoteBridgeStatus(settings.remoteBridge);
  const activeRemoteTarget = describeRemoteBridgeTarget(settings.remoteBridge);
  const activeRemoteTargetLabel = activeRemoteTarget.label;
  const activeRemoteTargetDescription = activeRemoteTarget.description;
  const selectedModel = settings.models.find((model) => model.id === selectedModelId) ?? settings.models[0];
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
  const slashSkillQuery = readSlashSkillQuery(officeDraft);
  const enabledSkills = skills.filter((skill) => skill.enabled);
  const filteredSlashSkills = slashSkillQuery === undefined
    ? []
    : enabledSkills
      .filter((skill) => (
        skill.name.toLowerCase().includes(slashSkillQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(slashSkillQuery.toLowerCase())
      ))
      .slice(0, 8);
  const composerSkillRequest: OfficeSkillRequest = pinnedSkillIds.length
    ? { mode: "pinned", pinnedSkillIds }
    : { mode: "auto", pinnedSkillIds: [] };
  const activeOfficeTaskElapsedMs = activeOfficeTask
    ? activeOfficeTask.phase === "processing" || activeOfficeTask.phase === "starting"
      ? officeElapsedMs
      : (activeOfficeTask.finishedAt ?? Date.now()) - activeOfficeTask.startedAt
    : 0;

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
  }, [section, activeConversation?.id, messages.length, messages.at(-1)?.content, sendingOfficeMessage, chatError, activeOfficeTask?.phase]);

  useEffect(() => {
    if (section !== "office" || !activeProject?.id || messages.length > 0) {
      setProjectMemorySuggestion(undefined);
      return;
    }
    let cancelled = false;
    void window.petApp.getProjectMemory(activeProject.id)
      .then((memory) => {
        if (!cancelled) {
          setProjectMemorySuggestion(buildProjectMemorySuggestion(memory));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectMemorySuggestion(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section, activeProject?.id, messages.length]);

  return (
    <main className="manager-app-shell">
      <ManagerSidebar
        settings={settings}
        section={section}
        projectName={projectName}
        visibleConversations={visibleConversations}
        collapsedProjectIds={collapsedProjectIds}
        settingsTab={settingsTab}
        renderConversationRow={renderConversationRow}
        onChooseWorkspace={chooseWorkspace}
        onCreateConversation={onCreateConversation}
        onSwitchProject={switchProjectFromRail}
        onDeleteProject={onDeleteProject}
        onToggleProjectCollapsed={toggleProjectCollapsed}
        onSectionChange={setSection}
        onSettingsTabChange={setSettingsTab}
      />

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
                <p>让哈基Mi处理当前项目里的事。</p>
                <div className="codex-empty-actions">
                  {projectMemorySuggestion && (
                    <button type="button" className="memory-suggestion" onClick={() => setOfficeDraft(projectMemorySuggestion.prompt)}>
                      {projectMemorySuggestion.label}
                    </button>
                  )}
                  {["读取 README", "整理当前目录", "检查最近文件"].map((prompt) => (
                    <button type="button" key={prompt} onClick={() => setOfficeDraft(prompt)}>
                      {prompt}
                    </button>
                  ))}
                  <button type="button" disabled={checkingCapabilities} onClick={() => void checkCapabilities()}>
                    {checkingCapabilities ? "检查中..." : "检查能力"}
                  </button>
                </div>
              </div>
            )}
            {messages.map((message, index) => {
              const isLatestMessage = index === messages.length - 1;
              return (
                <div
                  className={[
                    "codex-message-frame",
                    message.role === "user" ? "user" : "assistant",
                    isLatestMessage ? "latest" : ""
                  ].filter(Boolean).join(" ")}
                  key={index}
                >
                  <article className={message.role === "user" ? "codex-message user" : "codex-message assistant"}>
                {message.role === "assistant" && message.durationMs !== undefined && (
                  <span className="codex-message-meta">{formatProcessingTime(message.durationMs)}</span>
                )}
                <p>{message.displayContent ?? message.content}</p>
                {message.notices?.length ? (
                  <div className="message-notice-list">
                    {message.notices.map((notice, noticeIndex) => (
                      <p className={`message-notice ${notice.tone}`} key={`${notice.tone}-${noticeIndex}`}>
                        {notice.text}
                      </p>
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" ? renderOutputArtifacts(message) : null}
                  </article>
                  <div className="message-action-row">
                  <button type="button" title="复制" aria-label="复制消息" onClick={() => void copyOfficeMessage(message)}>
                    <Copy size={13} />
                  </button>
                  <button type="button" title="编辑" aria-label="编辑消息" onClick={() => editOfficeMessage(message)}>
                    <Pencil size={13} />
                  </button>
                  </div>
                </div>
              );
            })}
            {activeOfficeTask && (
              <article className={`codex-message assistant task-card phase-${activeOfficeTask.phase}`}>
                <div className="task-card-header">
                  <div>
                    <span className="codex-message-meta task-status-meta">
                      <span className="task-status-dot" />
                      {formatTaskStatus(activeOfficeTask.phase)} {formatTaskElapsed(activeOfficeTaskElapsedMs)}
                    </span>
                    <strong>{activeOfficeTask.title}</strong>
                  </div>
                  {sendingOfficeMessage && (
                    <button type="button" className="task-card-action" onClick={() => void cancelOfficeMessage()}>
                      停止
                    </button>
                  )}
                </div>
                <ol className="task-plan-list">
                  {activeOfficeTask.plan.map((step, index) => (
                    <li key={`${activeOfficeTask.id}-${step}`}>
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </li>
                  ))}
                </ol>
                {activeOfficeTask.error && <p className="task-card-error">{activeOfficeTask.error}</p>}
                {activeOfficeTask.phase === "failed" && lastFailedOfficeMessage && (
                  <div className="task-card-actions">
                    <button type="button" className="message-retry-button" onClick={() => void retryOfficeMessage()}>
                      重试
                    </button>
                    {activeAgentModel?.provider !== "claude-agent" && claudeAgentModels.length > 0 && (
                      <button
                        type="button"
                        className="message-retry-button"
                        onClick={() => {
                          const targetModelId = claudeAgentModels[0].id;
                          void updateAgentModel(targetModelId).then(() => retryOfficeMessage(targetModelId));
                        }}
                      >
                        换高级模型重试
                      </button>
                    )}
                  </div>
                )}
              </article>
            )}
            {!activeOfficeTask && officeTaskStatus === "cancelled" && !sendingOfficeMessage && (
              <article className="codex-message assistant task-status-message">
                <span className="codex-message-meta">已取消</span>
                <p>已停止生成，可以调整要求后继续。</p>
              </article>
            )}
            {!activeOfficeTask && chatError && (
              <article className="codex-message error task-status-message">
                <span className="codex-message-meta">失败</span>
                <p>{chatError}</p>
                {lastFailedOfficeMessage && (
                  <button type="button" className="message-retry-button" onClick={() => void retryOfficeMessage()}>
                    重试
                  </button>
                )}
              </article>
            )}
          </div>

          <form
            ref={composerRef}
            className={officeDragActive ? "codex-composer composer-drop-active" : "codex-composer"}
            onSubmit={submitOfficeMessage}
          >
            {pendingOfficeAttachments.length > 0 && (
              <div className="composer-attachments">
                {pendingOfficeAttachments.map((attachment) => (
                  <span className="composer-attachment" key={attachment.id}>
                    <Paperclip size={12} />
                    <span>{attachment.name}</span>
                    <button type="button" title="移除附件" aria-label={`移除附件 ${attachment.name}`} onClick={() => removeOfficeAttachment(attachment.id)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {skillMenuOpen && filteredSlashSkills.length > 0 && (
              <div className="composer-skill-menu">
                {filteredSlashSkills.map((skill) => (
                  <button
                    className="composer-skill-option"
                    key={skill.id}
                    type="button"
                    onClick={() => selectComposerSkill(skill)}
                  >
                    <span>/{skill.name}</span>
                    <small>{skill.description}</small>
                  </button>
                ))}
              </div>
            )}
            <input
              ref={officeDraftInputRef}
              value={officeDraft}
              disabled={sendingOfficeMessage}
              placeholder={sendingOfficeMessage ? "发送中..." : "要求后续变更"}
              onChange={(event) => handleOfficeDraftChange(event.target.value)}
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
              <div className="composer-permission-picker" ref={permissionMenuRef}>
                <button
                  className="composer-permission-button"
                  type="button"
                  title={activePermission.description}
                  aria-label={`权限：${activePermission.label}`}
                  aria-expanded={permissionMenuOpen}
                  onClick={() => setPermissionMenuOpen((open) => !open)}
                >
                  <span>{activePermission.label}</span>
                  <ChevronDown size={13} />
                </button>
                {permissionMenuOpen && (
                  <div className="composer-permission-menu">
                    {permissionOptions.map((option) => (
                      <button
                        className={option.id === settings.agent.permissionMode ? "active" : ""}
                        key={option.id}
                        type="button"
                        title={option.description}
                        onClick={() => {
                          setPermissionMenuOpen(false);
                          void updatePermissionMode(option.id);
                        }}
                      >
                        <span>{option.label}</span>
                        {option.id === settings.agent.permissionMode && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              <div className="composer-target-picker" ref={targetMenuRef}>
                <button
                  className={`composer-target-select ${settings.remoteBridge.activeTargetId === "local" ? "local-target" : "remote-target"}`}
                  type="button"
                  title={activeRemoteTargetDescription}
                  aria-expanded={targetMenuOpen}
                  onClick={() => setTargetMenuOpen((open) => !open)}
                >
                  <span>{activeRemoteTargetLabel}</span>
                  <ChevronDown size={13} />
                </button>
                {targetMenuOpen && (
                  <div className="composer-target-menu">
                    <button
                      className={settings.remoteBridge.activeTargetId === "local" ? "active" : ""}
                      type="button"
                      onClick={() => {
                        setTargetMenuOpen(false);
                        void updateRemoteTarget("local");
                      }}
                    >
                      <span>本机</span>
                      {settings.remoteBridge.activeTargetId === "local" && <Check size={13} />}
                    </button>
                    {settings.remoteBridge.knownHosts.map((host) => (
                      <button
                        className={settings.remoteBridge.activeTargetId === host.id ? "active" : ""}
                        key={host.id}
                        type="button"
                        title={host.address}
                        onClick={() => {
                          setTargetMenuOpen(false);
                          void updateRemoteTarget(host.id);
                        }}
                      >
                        <span>{host.name}</span>
                        {settings.remoteBridge.activeTargetId === host.id && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                title="删除当前会话"
                aria-label="删除当前会话"
                disabled={settings.conversations.length <= 1 || !activeConversation}
                onClick={() => activeConversation && void onDeleteConversation(activeConversation.id)}
              >
                <Trash2 size={16} />
              </button>
              <button
                className={sendingOfficeMessage ? "codex-send-button stop" : "codex-send-button"}
                title={sendingOfficeMessage ? "停止生成" : "发送"}
                aria-label={sendingOfficeMessage ? "停止生成" : "发送消息"}
                type={sendingOfficeMessage ? "button" : "submit"}
                disabled={!sendingOfficeMessage && !officeDraft.trim() && pendingOfficeAttachments.length === 0}
                onClick={sendingOfficeMessage ? () => void cancelOfficeMessage() : undefined}
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
                <span>控制模式</span>
                <input
                  type="checkbox"
                  checked={settings.keyboardControlEnabled}
                  onChange={(event) => void update({ ...settings, keyboardControlEnabled: event.target.checked })}
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

      {section === "settings" && settingsTab === "models" && (
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

      {section === "settings" && settingsTab === "skills" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">HaJiMi</p>
              <h1>Skills</h1>
              <p>导入和管理可被办公模型调用的技能。输入框里用 /技能名 可以临时指定本次任务。</p>
            </div>
            <button className="primary-command" onClick={() => void importSkill()}>
              <Download size={18} />
              导入 Skill
            </button>
          </header>
          <div className="skill-manager-layout">
            <aside className="skill-index-panel">
              <div className="model-index-heading">
                <span>技能列表</span>
                <button title="刷新 Skills" onClick={() => void refreshSkills()}>
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="skill-index-list">
                {skills.length === 0 ? (
                  <p className="manager-note">还没有导入 Skill。选择包含 SKILL.md 的文件夹即可添加。</p>
                ) : skills.map((skill) => (
                  <button
                    className={skill.id === selectedSkill?.id ? "skill-index-row active" : "skill-index-row"}
                    key={skill.id}
                    onClick={() => setSelectedSkillId(skill.id)}
                  >
                    <strong>/{skill.name}</strong>
                    <span>{skill.enabled ? "已启用" : "已停用"} · {skill.scope === "project" ? "当前项目" : "全局"}</span>
                    <small>{skill.description}</small>
                  </button>
                ))}
              </div>
            </aside>

            {selectedSkill ? (
              <div className="skill-detail-card">
                <div className="skill-card-title">
                  <div>
                    <strong>/{selectedSkill.name}</strong>
                    <small>{selectedSkill.source} · {selectedSkill.id}</small>
                  </div>
                  <button title="删除 Skill" onClick={() => void removeSkill(selectedSkill.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="skill-detail-preview">{selectedSkill.description}</p>
                <label className="manager-toggle">
                  <span>启用</span>
                  <input
                    type="checkbox"
                    checked={selectedSkill.enabled}
                    onChange={(event) => void updateSkill(selectedSkill.id, { enabled: event.target.checked })}
                  />
                </label>
                <label>
                  作用范围
                  <select
                    value={selectedSkill.scope}
                    onChange={(event) => {
                      const scope = event.target.value as SkillScope;
                      void updateSkill(selectedSkill.id, {
                        scope,
                        projectPath: scope === "project" ? settings.agent.workspaceDir : undefined
                      });
                    }}
                  >
                    <option value="global">全局可用</option>
                    <option value="project">仅当前项目</option>
                  </select>
                </label>
                {selectedSkill.scope === "project" && (
                  <label>
                    项目路径
                    <input
                      value={selectedSkill.projectPath ?? settings.agent.workspaceDir}
                      onChange={(event) => void updateSkill(selectedSkill.id, { projectPath: event.target.value })}
                    />
                  </label>
                )}
                <label>
                  技能文件
                  <input value={selectedSkill.path} readOnly />
                </label>
                {selectedSkill.warnings.length > 0 && (
                  <div className="skill-warning-list">
                    {selectedSkill.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="skill-detail-card empty">
                <Sparkles size={34} />
                <p>选择一个 Skill 查看详情。</p>
              </div>
            )}
          </div>
          {skillsMessage && <p className="save-state">{skillsMessage}</p>}
        </section>
      )}

      {section === "settings" && settingsTab === "channels" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">哈基Mi</p>
              <h1>通道</h1>
              <p>把飞书和微信消息接入哈基Mi，远程消息会进入当前办公会话。</p>
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
                <div className="channel-route-summary">
                  <span>默认接入</span>
                  <strong>当前办公会话</strong>
                </div>
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

      {section === "settings" && settingsTab === "general" && (
        <section className="codex-config-main">
          <header className="codex-config-header">
            <div>
              <p className="eyebrow">HaJiMi 设置</p>
              <h1>常规</h1>
            </div>
          </header>
          <div className="manager-grid">
            <div className="manager-section capability-section">
              <div className="section-title">
                <ShieldCheck size={18} />
                <span>能力体检</span>
              </div>
              <p className="manager-note">
                检查模型、项目读写、普通办公、Claude Code、OpenClaw 和微信通道是否可用。
              </p>
              <button className="secondary-command" disabled={checkingCapabilities} onClick={() => void checkCapabilities()}>
                <RefreshCw size={16} />
                {checkingCapabilities ? "检查中..." : "检查当前能力"}
              </button>
              {capabilityResult && (
                <div className="capability-result">
                  <p>{summarizeCapabilities(capabilityResult.rows)}</p>
                  <div className="capability-rows">
                    {capabilityResult.rows.map((row) => (
                      <div className={`capability-row ${row.status}`} key={row.id}>
                        <span>{capabilityStatusLabel(row.status)}</span>
                        <div>
                          <strong>{row.label}</strong>
                          <small>{row.message}</small>
                          {row.fix && <small>{row.fix}</small>}
                          {row.repair && (
                            <button
                              type="button"
                              className="capability-repair-button"
                              disabled={Boolean(repairingCapabilityId)}
                              onClick={() => void repairCapability(row.id, row.repair.id)}
                            >
                              {repairingCapabilityId === row.id ? "修复中..." : row.repair.label}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {capabilityRepairMessage && <p className="save-state capability-repair-message">{capabilityRepairMessage}</p>}
                </div>
              )}
            </div>
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
            <div className="manager-section remote-bridge-section">
              <div className="section-title">
                <Sparkles size={18} />
                <span>跨电脑桥接</span>
              </div>
              <div className="remote-bridge-summary">
                <div className="remote-bridge-summary-item">
                  <span>本机桥接</span>
                  <strong>{remoteBridgeSummary.local.label}</strong>
                  <small>{settings.remoteBridge.enabled ? `${settings.remoteBridge.deviceName} · ${settings.remoteBridge.host.status}` : "未启用"}</small>
                </div>
                <div className="remote-bridge-summary-item">
                  <span>云中转</span>
                  <strong>{remoteBridgeSummary.relay.label}</strong>
                  <small>{settings.remoteBridge.relay.enabled ? (settings.remoteBridge.relay.url || "已启用") : "未启用"}</small>
                </div>
                <div className="remote-bridge-summary-item active">
                  <span>执行目标</span>
                  <strong>{activeRemoteTargetLabel}</strong>
                  <small>{activeRemoteTargetDescription}</small>
                </div>
              </div>
              <div className="remote-bridge-grid">
                <div className="remote-bridge-column">
                  <label className="manager-toggle">
                    <span>启用本机桥接</span>
                    <input
                      type="checkbox"
                      checked={settings.remoteBridge.enabled}
                      onChange={(event) =>
                        void update({
                          ...settings,
                          remoteBridge: { ...settings.remoteBridge, enabled: event.target.checked }
                        })
                      }
                    />
                  </label>
                  <label>
                    设备名称
                    <input
                      value={settings.remoteBridge.deviceName}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          remoteBridge: { ...settings.remoteBridge, deviceName: event.target.value }
                        })
                      }
                      onBlur={() => void save()}
                    />
                  </label>
                  <label className="manager-toggle">
                    <span>启用云中转</span>
                    <input
                      type="checkbox"
                      checked={settings.remoteBridge.relay.enabled}
                      onChange={(event) =>
                        void update({
                          ...settings,
                          remoteBridge: {
                            ...settings.remoteBridge,
                            relay: {
                              ...settings.remoteBridge.relay,
                              enabled: event.target.checked
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    中转服务 URL
                    <input
                      value={settings.remoteBridge.relay.url}
                      placeholder="https://relay.example.com"
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          remoteBridge: {
                            ...settings.remoteBridge,
                            relay: {
                              ...settings.remoteBridge.relay,
                              url: event.target.value
                            }
                          }
                        })
                      }
                      onBlur={() => void save()}
                    />
                  </label>
                  <label>
                    权限级别
                    <select
                      value={settings.remoteBridge.host.permissionMode}
                      onChange={(event) =>
                        void update({
                          ...settings,
                          remoteBridge: {
                            ...settings.remoteBridge,
                            host: {
                              ...settings.remoteBridge.host,
                              permissionMode: event.target.value as AgentPermissionMode
                            }
                          }
                        })
                      }
                    >
                      <option value="default">默认权限</option>
                      <option value="auto-review">自动审查</option>
                      <option value="full-access">完全访问权限</option>
                    </select>
                  </label>
                  <div className="remote-bridge-status-row">
                    <span>状态</span>
                    <strong>{remoteBridgeSummary.local.label}</strong>
                  </div>
                  <div className="network-actions">
                    <button className="secondary-command" disabled={saving} onClick={() => void startRemoteBridge()}>
                      <RefreshCw size={16} />
                      启动桥接
                    </button>
                    <button className="secondary-command" disabled={saving} onClick={() => void generateRemotePairingCode()}>
                      <Sparkles size={16} />
                      生成配对码
                    </button>
                    <button className="secondary-command" disabled={saving} onClick={() => void stopRemoteBridge()}>
                      <Square size={16} />
                      停止桥接
                    </button>
                  </div>
                  {settings.remoteBridge.host.pairingCode && (
                    <div className="remote-bridge-code">
                      <span>配对码</span>
                      <strong>{settings.remoteBridge.host.pairingCode}</strong>
                      {settings.remoteBridge.host.pairingExpiresAt && (
                        <small>有效期至 {new Date(settings.remoteBridge.host.pairingExpiresAt).toLocaleTimeString()}</small>
                      )}
                    </div>
                  )}
                  <div className="remote-host-list">
                    <p className="manager-note">已授权设备</p>
                    {settings.remoteBridge.trustedDevices.length === 0 ? (
                      <p className="manager-note">还没有设备被授权。</p>
                    ) : settings.remoteBridge.trustedDevices.map((device) => (
                      <div className="remote-host-item" key={device.id}>
                        <div>
                          <strong>{device.name}</strong>
                          <small>{device.allowedWorkspace}</small>
                          <small>{device.permissionMode}</small>
                        </div>
                        <div className="remote-host-actions">
                          <button type="button" onClick={() => void revokeRemoteDevice(device.id)}>
                            撤销
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="remote-bridge-column">
                  <label>
                    远端地址
                    <input
                      value={remotePairingAddress}
                      placeholder="http://127.0.0.1:18031 或 https://relay.example.com"
                      onChange={(event) => setRemotePairingAddress(event.target.value)}
                    />
                  </label>
                  <label>
                    配对码
                    <input
                      value={remotePairingCode}
                      placeholder="6 位数字"
                      onChange={(event) => setRemotePairingCode(event.target.value)}
                    />
                  </label>
                  <div className="network-actions">
                    <button className="secondary-command" disabled={saving || scanningRemoteBridges} onClick={() => void discoverRemoteBridges()}>
                      <RefreshCw size={16} />
                      {scanningRemoteBridges ? "扫描中" : "扫描局域网"}
                    </button>
                    <button className="secondary-command" disabled={saving} onClick={() => void connectRemoteHost()}>
                      <MessageCircle size={16} />
                      连接远端电脑
                    </button>
                  </div>
                  {remoteDiscoveryResults.length > 0 && (
                    <div className="remote-host-list">
                      <p className="manager-note">扫描结果</p>
                      {remoteDiscoveryResults.map((host) => (
                        <div className="remote-host-item" key={`${host.address}-${host.name}`}>
                          <div>
                            <strong>{host.name}</strong>
                            <small>{host.address}</small>
                            <small>{host.pairingAvailable ? "可输入配对码连接" : "等待对方生成配对码"}</small>
                          </div>
                          <div className="remote-host-actions">
                            <button type="button" onClick={() => fillRemoteDiscoveredHost(host)}>
                              填入
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="remote-host-list">
                    {settings.remoteBridge.knownHosts.length === 0 ? (
                      <p className="manager-note">还没有连接过其他电脑。</p>
                    ) : settings.remoteBridge.knownHosts.map((host) => (
                      <div className="remote-host-item" key={host.id}>
                        <div>
                          <strong>{host.name}</strong>
                          <small>{host.address}</small>
                          <small>{host.transport === "relay" ? "云中转" : "直连"}</small>
                        </div>
                        <div className="remote-host-actions">
                          <button
                            type="button"
                            className={settings.remoteBridge.activeTargetId === host.id ? "active" : ""}
                            onClick={() => void updateRemoteTarget(host.id)}
                          >
                            {settings.remoteBridge.activeTargetId === host.id ? "正在使用" : "切换"}
                          </button>
                          <button type="button" onClick={() => void removeKnownHost(host.id)}>
                            移除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="manager-note">当前执行环境：{activeRemoteTargetDescription}</p>
              {remoteBridgeMessage && <p className="save-state">{remoteBridgeMessage}</p>}
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

function readSlashSkillQuery(text: string): string | undefined {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const match = trimmed.match(/^\/([^\s/]*)/u);
  return match ? match[1] : "";
}

function removeSlashSkillPrefix(text: string): string {
  return text.trimStart().replace(/^\/[^\s/]*\s*/u, "").trim();
}

function formatProcessingTime(durationMs: number): string {
  return `已处理 ${formatElapsedTime(durationMs)}`;
}

function formatElapsedTime(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function normalizeRemoteBridgeAddress(address: string): string {
  return new URL(address.trim()).toString().replace(/\/$/u, "");
}
