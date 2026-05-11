import { contextBridge, ipcRenderer } from "electron";
import type { ChatMessage } from "./chatClient.js";
import type { AppSettings, ModelProfile } from "./settingsStore.js";
import type { ChannelProvider } from "../src/lib/channels.js";
import type { PetAppState, PetWindowBounds } from "../src/global.js";
import type { PetMoveCommand } from "../src/lib/petMotion.js";
import type { PetPlayCommand } from "../src/lib/petPlay.js";
import type { PetAction } from "../src/lib/petActions.js";

const petSlot = Number(new URLSearchParams(globalThis.location.search).get("slot") ?? "0");

contextBridge.exposeInMainWorld("petApp", {
  getInitialState: () => ipcRenderer.invoke("pet:get-initial-state", petSlot),
  importPet: () => ipcRenderer.invoke("pet:import"),
  deletePet: (petId: string) => ipcRenderer.invoke("pet:delete", petId),
  switchPet: (petId: string) => ipcRenderer.invoke("pet:switch", petId),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("pet:save-settings", settings),
  startChannel: (provider: ChannelProvider) => ipcRenderer.invoke("pet:start-channel", provider),
  stopChannel: (provider: ChannelProvider) => ipcRenderer.invoke("pet:stop-channel", provider),
  testChannel: (provider: ChannelProvider) => ipcRenderer.invoke("pet:test-channel", provider),
  sendChat: (messages: ChatMessage[], modelId?: string) => ipcRenderer.invoke("pet:send-chat", messages, modelId),
  runAgentTask: (task: string, modelId?: string) => ipcRenderer.invoke("pet:run-agent-task", task, modelId),
  heartbeatGreeting: (prompt: string) => ipcRenderer.invoke("pet:heartbeat-greeting", prompt),
  testModel: (model: ModelProfile) => ipcRenderer.invoke("pet:test-model", model),
  checkUpdates: () => ipcRenderer.invoke("pet:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("pet:download-update"),
  installUpdate: () => ipcRenderer.invoke("pet:install-update"),
  checkNotices: () => ipcRenderer.invoke("pet:check-notices"),
  markNoticeRead: (noticeId: string) => ipcRenderer.invoke("pet:mark-notice-read", noticeId),
  chooseWorkspace: () => ipcRenderer.invoke("pet:choose-workspace"),
  switchProject: (projectId: string) => ipcRenderer.invoke("pet:switch-project", projectId),
  deleteProject: (projectId: string) => ipcRenderer.invoke("pet:delete-project", projectId),
  setPetWindowBounds: (bounds: PetWindowBounds) => ipcRenderer.invoke("pet:set-window-bounds", petSlot, bounds),
  getPetWindowBounds: () => ipcRenderer.invoke("pet:get-window-bounds", petSlot),
  movePetTo: (command: PetMoveCommand) => ipcRenderer.invoke("pet:move-pet-to", petSlot, command),
  setChatOpen: (open: boolean) => ipcRenderer.invoke("pet:set-chat-open", petSlot, open),
  setMousePassthrough: (passthrough: boolean) => ipcRenderer.invoke("pet:set-mouse-passthrough", petSlot, passthrough),
  getCursorScreenPoint: () => ipcRenderer.invoke("pet:get-cursor-screen-point"),
  onStateChanged: (callback: (state: PetAppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PetAppState) => callback(state);
    ipcRenderer.on("pet:state-changed", listener);
    return () => ipcRenderer.off("pet:state-changed", listener);
  },
  onPlayCommand: (callback: (command: PetPlayCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: PetPlayCommand) => callback(command);
    ipcRenderer.on("pet:play-command", listener);
    return () => ipcRenderer.off("pet:play-command", listener);
  },
  onOutsideInteraction: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("pet:outside-interaction", listener);
    return () => ipcRenderer.off("pet:outside-interaction", listener);
  },
  onExternalPetActions: (callback: (actions: PetAction[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, actions: PetAction[]) => callback(actions);
    ipcRenderer.on("pet:external-actions", listener);
    return () => ipcRenderer.off("pet:external-actions", listener);
  }
});
