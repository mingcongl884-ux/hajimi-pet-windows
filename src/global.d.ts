import type { ChatMessage, ChatResponse } from "../electron/chatClient";
import type { UpdateCheckResult } from "../electron/networkClient";
import type { AppSettings, ModelProfile } from "../electron/settingsStore";
import type { RemoteNotice } from "../electron/settingsStore";
import type { PetPlayCommand } from "./lib/petPlay";
import type { InstalledPet } from "./lib/petTypes";

export type PetAppState = {
  settings: AppSettings;
  pets: InstalledPet[];
  activePet?: InstalledPet;
  activePets?: InstalledPet[];
  screen: {
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

declare global {
  interface Window {
    petApp: {
      getInitialState(): Promise<PetAppState>;
      importPet(): Promise<PetAppState>;
      deletePet(petId: string): Promise<PetAppState>;
      switchPet(petId: string): Promise<PetAppState>;
      saveSettings(settings: AppSettings): Promise<PetAppState>;
      sendChat(messages: ChatMessage[]): Promise<ChatResponse>;
      runAgentTask(task: string): Promise<ChatResponse>;
      heartbeatGreeting(prompt: string): Promise<ChatResponse>;
      testModel(model: ModelProfile): Promise<string>;
      checkUpdates(): Promise<UpdateCheckResult>;
      downloadUpdate(): Promise<UpdateCheckResult>;
      installUpdate(): Promise<UpdateCheckResult>;
      checkNotices(): Promise<{ notices: RemoteNotice[]; checkedAt: string; message?: string }>;
      markNoticeRead(noticeId: string): Promise<PetAppState>;
      chooseWorkspace(): Promise<PetAppState>;
      setPetWindowBounds(bounds: PetWindowBounds): Promise<void>;
      setMousePassthrough(passthrough: boolean): Promise<void>;
      onStateChanged(callback: (state: PetAppState) => void): () => void;
      onPlayCommand(callback: (command: PetPlayCommand) => void): () => void;
    };
  }
}

export {};
