import { contextBridge, ipcRenderer } from "electron";
import type { ChatMessage } from "./chatClient.js";
import type { AppSettings, ModelProfile } from "./settingsStore.js";
import type { PetAppState, PetWindowBounds } from "../src/global.js";
import type { PetPlayCommand } from "../src/lib/petPlay.js";

const petSlot = Number(new URLSearchParams(globalThis.location.search).get("slot") ?? "0");

contextBridge.exposeInMainWorld("petApp", {
  getInitialState: () => ipcRenderer.invoke("pet:get-initial-state", petSlot),
  importPet: () => ipcRenderer.invoke("pet:import"),
  deletePet: (petId: string) => ipcRenderer.invoke("pet:delete", petId),
  switchPet: (petId: string) => ipcRenderer.invoke("pet:switch", petId),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("pet:save-settings", settings),
  sendChat: (messages: ChatMessage[]) => ipcRenderer.invoke("pet:send-chat", messages),
  runAgentTask: (task: string) => ipcRenderer.invoke("pet:run-agent-task", task),
  heartbeatGreeting: (prompt: string) => ipcRenderer.invoke("pet:heartbeat-greeting", prompt),
  testModel: (model: ModelProfile) => ipcRenderer.invoke("pet:test-model", model),
  checkUpdates: () => ipcRenderer.invoke("pet:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("pet:download-update"),
  installUpdate: () => ipcRenderer.invoke("pet:install-update"),
  checkNotices: () => ipcRenderer.invoke("pet:check-notices"),
  markNoticeRead: (noticeId: string) => ipcRenderer.invoke("pet:mark-notice-read", noticeId),
  chooseWorkspace: () => ipcRenderer.invoke("pet:choose-workspace"),
  setPetWindowBounds: (bounds: PetWindowBounds) => ipcRenderer.invoke("pet:set-window-bounds", petSlot, bounds),
  setMousePassthrough: (passthrough: boolean) => ipcRenderer.invoke("pet:set-mouse-passthrough", petSlot, passthrough),
  onStateChanged: (callback: (state: PetAppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PetAppState) => callback(state);
    ipcRenderer.on("pet:state-changed", listener);
    return () => ipcRenderer.off("pet:state-changed", listener);
  },
  onPlayCommand: (callback: (command: PetPlayCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: PetPlayCommand) => callback(command);
    ipcRenderer.on("pet:play-command", listener);
    return () => ipcRenderer.off("pet:play-command", listener);
  }
});
