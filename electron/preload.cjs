const { contextBridge, ipcRenderer } = require("electron");
const petSlot = Number(new URLSearchParams(globalThis.location.search).get("slot") || "0");

contextBridge.exposeInMainWorld("petApp", {
  getInitialState: () => ipcRenderer.invoke("pet:get-initial-state", petSlot),
  importPet: () => ipcRenderer.invoke("pet:import"),
  deletePet: (petId) => ipcRenderer.invoke("pet:delete", petId),
  switchPet: (petId) => ipcRenderer.invoke("pet:switch", petId),
  saveSettings: (settings) => ipcRenderer.invoke("pet:save-settings", settings),
  startChannel: (provider) => ipcRenderer.invoke("pet:start-channel", provider),
  stopChannel: (provider) => ipcRenderer.invoke("pet:stop-channel", provider),
  testChannel: (provider) => ipcRenderer.invoke("pet:test-channel", provider),
  sendChat: (messages) => ipcRenderer.invoke("pet:send-chat", messages),
  runAgentTask: (task) => ipcRenderer.invoke("pet:run-agent-task", task),
  heartbeatGreeting: (prompt) => ipcRenderer.invoke("pet:heartbeat-greeting", prompt),
  testModel: (model) => ipcRenderer.invoke("pet:test-model", model),
  checkUpdates: () => ipcRenderer.invoke("pet:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("pet:download-update"),
  installUpdate: () => ipcRenderer.invoke("pet:install-update"),
  checkNotices: () => ipcRenderer.invoke("pet:check-notices"),
  markNoticeRead: (noticeId) => ipcRenderer.invoke("pet:mark-notice-read", noticeId),
  chooseWorkspace: () => ipcRenderer.invoke("pet:choose-workspace"),
  setPetWindowBounds: (bounds) => ipcRenderer.invoke("pet:set-window-bounds", petSlot, bounds),
  setMousePassthrough: (passthrough) => ipcRenderer.invoke("pet:set-mouse-passthrough", petSlot, passthrough),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pet:state-changed", listener);
    return () => ipcRenderer.off("pet:state-changed", listener);
  },
  onPlayCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("pet:play-command", listener);
    return () => ipcRenderer.off("pet:play-command", listener);
  }
});
