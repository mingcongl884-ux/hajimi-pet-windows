import type { ChatMessage, ChatResponse } from "../electron/chatClient";
import type { ChannelAdapterResult } from "../electron/channelAdapters";
import type { UpdateCheckResult } from "../electron/networkClient";
import type { AppSettings, ModelProfile } from "../electron/settingsStore";
import type { RemoteNotice } from "../electron/settingsStore";
import type { ChannelProvider } from "./lib/channels";
import type { PetPlayCommand } from "./lib/petPlay";
import type { PetMoveCommand } from "./lib/petMotion";
import type { PetAction } from "./lib/petActions";
import type { InstalledPet } from "./lib/petTypes";

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

declare global {
  interface Window {
    petApp: {
      getInitialState(): Promise<PetAppState>;
      importPet(): Promise<PetAppState>;
      deletePet(petId: string): Promise<PetAppState>;
      switchPet(petId: string): Promise<PetAppState>;
      saveSettings(settings: AppSettings): Promise<PetAppState>;
      startChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      stopChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      testChannel(provider: ChannelProvider): Promise<ChannelAdapterResult>;
      sendChat(messages: ChatMessage[], modelId?: string): Promise<ChatResponse>;
      runAgentTask(task: string, modelId?: string): Promise<ChatResponse>;
      heartbeatGreeting(prompt: string): Promise<ChatResponse>;
      testModel(model: ModelProfile): Promise<string>;
      checkUpdates(): Promise<UpdateCheckResult>;
      downloadUpdate(): Promise<UpdateCheckResult>;
      installUpdate(): Promise<UpdateCheckResult>;
      checkNotices(): Promise<{ notices: RemoteNotice[]; checkedAt: string; message?: string }>;
      markNoticeRead(noticeId: string): Promise<PetAppState>;
      chooseWorkspace(): Promise<PetAppState>;
      switchProject(projectId: string): Promise<PetAppState>;
      deleteProject(projectId: string): Promise<PetAppState>;
      setPetWindowBounds(bounds: PetWindowBounds): Promise<void>;
      getPetWindowBounds(): Promise<PetAppState["windowBounds"]>;
      movePetTo(command: PetMoveCommand): Promise<void>;
      setChatOpen(open: boolean): Promise<void>;
      setMousePassthrough(passthrough: boolean): Promise<void>;
      getCursorScreenPoint(): Promise<ScreenPoint>;
      onStateChanged(callback: (state: PetAppState) => void): () => void;
      onPlayCommand(callback: (command: PetPlayCommand) => void): () => void;
      onOutsideInteraction(callback: () => void): () => void;
      onExternalPetActions(callback: (actions: PetAction[]) => void): () => void;
    };
  }
}

export {};
