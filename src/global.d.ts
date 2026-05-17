import type { ChatMessage, ChatResponse } from "../electron/chatClient";
import type { ChannelAdapterResult } from "../electron/channelAdapters";
import type { UpdateCheckResult } from "../electron/networkClient";
import type { AppSettings, ModelProfile } from "../electron/settingsStore";
import type { RemoteNotice } from "../electron/settingsStore";
import type { RemoteBridgeDiscoveryResult } from "../electron/remoteBridgeDiscovery";
import type { CapabilityCheckResult, CapabilityRepairActionId, CapabilityRepairResult } from "./lib/capabilityCheck";
import type { ProjectMemory, ProjectMemoryUpdate } from "./lib/projectMemory";
import type { ChannelProvider } from "./lib/channels";
import type { PetPlayCommand } from "./lib/petPlay";
import type { PetMoveCommand } from "./lib/petMotion";
import type { PetAction } from "./lib/petActions";
import type { PetControlKey } from "./lib/petKeyboardControl";
import type { InstalledPet } from "./lib/petTypes";
import type { ManagedSkill, OfficeSkillRequest } from "./lib/skills";
import type { SkillUpdatePatch } from "../electron/skillStore";

export type PetAppState = {
  settings: AppSettings;
  pets: InstalledPet[];
  activePet?: InstalledPet;
  activePets?: InstalledPet[];
  screen: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  windowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type PetWindowBounds = {
  x: number;
  y: number;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export type SystemStatus = {
  memory: {
    totalBytes: number;
    freeBytes: number;
  };
};

declare global {
  interface Window {
    petApp: {
      getInitialState(): Promise<PetAppState>;
      importPet(): Promise<PetAppState>;
      deletePet(petId: string): Promise<PetAppState>;
      switchPet(petId: string): Promise<PetAppState>;
      saveSettings(settings: AppSettings): Promise<PetAppState>;
      startRemoteBridge(): Promise<PetAppState>;
      stopRemoteBridge(): Promise<PetAppState>;
      generateRemotePairingCode(): Promise<PetAppState>;
      revokeRemoteDevice(deviceId: string): Promise<PetAppState>;
      discoverRemoteBridges(): Promise<RemoteBridgeDiscoveryResult[]>;
      startChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      stopChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      testChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      sendChat(messages: ChatMessage[], modelId?: string, requestId?: string): Promise<ChatResponse>;
      runAgentTask(task: string, modelId?: string, requestId?: string, skillRequest?: OfficeSkillRequest): Promise<ChatResponse>;
      emitExternalPetActions(actions: PetAction[]): Promise<void>;
      cancelChatTask(requestId: string): Promise<boolean>;
      heartbeatGreeting(prompt: string): Promise<ChatResponse>;
      testModel(model: ModelProfile): Promise<string>;
      checkCapabilities(): Promise<CapabilityCheckResult>;
      repairCapability(actionId: CapabilityRepairActionId, rowId?: string): Promise<CapabilityRepairResult>;
      checkUpdates(): Promise<UpdateCheckResult>;
      downloadUpdate(): Promise<UpdateCheckResult>;
      installUpdate(): Promise<UpdateCheckResult>;
      checkNotices(): Promise<{ notices: RemoteNotice[]; checkedAt: string; message?: string }>;
      markNoticeRead(noticeId: string): Promise<PetAppState>;
      openManager(): Promise<void>;
      chooseWorkspace(): Promise<PetAppState>;
      switchProject(projectId: string): Promise<PetAppState>;
      deleteProject(projectId: string): Promise<PetAppState>;
      listSkills(): Promise<ManagedSkill[]>;
      importSkillFolder(): Promise<ManagedSkill | undefined>;
      updateSkill(skillId: string, patch: SkillUpdatePatch): Promise<ManagedSkill>;
      removeSkill(skillId: string): Promise<void>;
      getProjectMemory(projectId: string): Promise<ProjectMemory | undefined>;
      updateProjectMemory(update: ProjectMemoryUpdate): Promise<ProjectMemory>;
      openOutputFile(path: string): Promise<void>;
      showOutputFile(path: string): Promise<void>;
      setPetWindowBounds(bounds: PetWindowBounds): Promise<void>;
      getPetWindowBounds(): Promise<PetAppState["windowBounds"]>;
      movePetTo(command: PetMoveCommand): Promise<void>;
      setChatOpen(open: boolean): Promise<void>;
      setMousePassthrough(passthrough: boolean): Promise<void>;
      getCursorScreenPoint(): Promise<ScreenPoint>;
      getSystemStatus(): Promise<SystemStatus>;
      onStateChanged(callback: (state: PetAppState) => void): () => void;
      onPlayCommand(callback: (command: PetPlayCommand) => void): () => void;
      onKeyboardControl(callback: (key: PetControlKey) => void): () => void;
      onOutsideInteraction(callback: () => void): () => void;
      onExternalPetActions(callback: (actions: PetAction[]) => void): () => void;
    };
  }
}

export {};
