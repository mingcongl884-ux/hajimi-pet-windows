import { contextBridge, ipcRenderer } from "electron";
import type { ChatMessage } from "./chatClient.js";
import type { AppSettings, ModelProfile } from "./settingsStore.js";
import type { ChannelProvider } from "../src/lib/channels.js";
import type { CapabilityCheckResult } from "../src/lib/capabilityCheck.js";
import type { ProjectMemory, ProjectMemoryUpdate } from "../src/lib/projectMemory.js";
import type { PetAppState, PetWindowBounds } from "../src/global.js";
import type { PetMoveCommand } from "../src/lib/petMotion.js";
import type { PetPlayCommand } from "../src/lib/petPlay.js";
import type { PetAction } from "../src/lib/petActions.js";
import type { PetControlKey } from "../src/lib/petKeyboardControl.js";

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
  sendChat: (messages: ChatMessage[], modelId?: string, requestId?: string) => ipcRenderer.invoke("pet:send-chat", messages, modelId, requestId),
  runAgentTask: (task: string, modelId?: string, requestId?: string) => ipcRenderer.invoke("pet:run-agent-task", task, modelId, requestId),
  cancelChatTask: (requestId: string) => ipcRenderer.invoke("pet:cancel-chat-task", requestId),
  heartbeatGreeting: (prompt: string) => ipcRenderer.invoke("pet:heartbeat-greeting", prompt),
  testModel: (model: ModelProfile) => ipcRenderer.invoke("pet:test-model", model),
  checkCapabilities: (): Promise<CapabilityCheckResult> => ipcRenderer.invoke("pet:check-capabilities"),
  checkUpdates: () => ipcRenderer.invoke("pet:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("pet:download-update"),
  installUpdate: () => ipcRenderer.invoke("pet:install-update"),
  checkNotices: () => ipcRenderer.invoke("pet:check-notices"),
  markNoticeRead: (noticeId: string) => ipcRenderer.invoke("pet:mark-notice-read", noticeId),
  openManager: () => ipcRenderer.invoke("pet:open-manager"),
  chooseWorkspace: () => ipcRenderer.invoke("pet:choose-workspace"),
  switchProject: (projectId: string) => ipcRenderer.invoke("pet:switch-project", projectId),
  deleteProject: (projectId: string) => ipcRenderer.invoke("pet:delete-project", projectId),
  getProjectMemory: (projectId: string): Promise<ProjectMemory | undefined> => ipcRenderer.invoke("pet:get-project-memory", projectId),
  updateProjectMemory: (update: ProjectMemoryUpdate): Promise<ProjectMemory> => ipcRenderer.invoke("pet:update-project-memory", update),
  openOutputFile: (path: string) => ipcRenderer.invoke("pet:open-output-file", path),
  showOutputFile: (path: string) => ipcRenderer.invoke("pet:show-output-file", path),
  setPetWindowBounds: (bounds: PetWindowBounds) => ipcRenderer.invoke("pet:set-window-bounds", petSlot, bounds),
  getPetWindowBounds: () => ipcRenderer.invoke("pet:get-window-bounds", petSlot),
  movePetTo: (command: PetMoveCommand) => ipcRenderer.invoke("pet:move-pet-to", petSlot, command),
  setChatOpen: (open: boolean) => ipcRenderer.invoke("pet:set-chat-open", petSlot, open),
  setMousePassthrough: (passthrough: boolean) => ipcRenderer.invoke("pet:set-mouse-passthrough", petSlot, passthrough),
  getCursorScreenPoint: () => ipcRenderer.invoke("pet:get-cursor-screen-point"),
  getSystemStatus: () => ipcRenderer.invoke("pet:get-system-status"),
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
  onKeyboardControl: (callback: (key: PetControlKey) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, key: PetControlKey) => callback(key);
    ipcRenderer.on("pet:keyboard-control", listener);
    return () => ipcRenderer.off("pet:keyboard-control", listener);
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
