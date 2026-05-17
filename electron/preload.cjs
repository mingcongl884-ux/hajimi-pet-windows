const { contextBridge, ipcRenderer } = require("electron");
const petSlot = Number(new URLSearchParams(globalThis.location.search).get("slot") || "0");

contextBridge.exposeInMainWorld("petApp", {
  getInitialState: () => ipcRenderer.invoke("pet:get-initial-state", petSlot),
  importPet: () => ipcRenderer.invoke("pet:import"),
  deletePet: (petId) => ipcRenderer.invoke("pet:delete", petId),
  switchPet: (petId) => ipcRenderer.invoke("pet:switch", petId),
  saveSettings: (settings) => ipcRenderer.invoke("pet:save-settings", settings),
  startRemoteBridge: () => ipcRenderer.invoke("pet:start-remote-bridge"),
  stopRemoteBridge: () => ipcRenderer.invoke("pet:stop-remote-bridge"),
  generateRemotePairingCode: () => ipcRenderer.invoke("pet:generate-remote-pairing-code"),
  revokeRemoteDevice: (deviceId) => ipcRenderer.invoke("pet:revoke-remote-device", deviceId),
  discoverRemoteBridges: () => ipcRenderer.invoke("pet:discover-remote-bridges"),
  startChannel: (provider) => ipcRenderer.invoke("pet:start-channel", provider),
  stopChannel: (provider) => ipcRenderer.invoke("pet:stop-channel", provider),
  testChannel: (provider) => ipcRenderer.invoke("pet:test-channel", provider),
  sendChat: (messages, modelId, requestId) => ipcRenderer.invoke("pet:send-chat", messages, modelId, requestId),
  runAgentTask: (task, modelId, requestId, skillRequest) => ipcRenderer.invoke("pet:run-agent-task", task, modelId, requestId, skillRequest),
  emitExternalPetActions: (actions) => ipcRenderer.invoke("pet:emit-external-actions", actions),
  cancelChatTask: (requestId) => ipcRenderer.invoke("pet:cancel-chat-task", requestId),
  heartbeatGreeting: (prompt) => ipcRenderer.invoke("pet:heartbeat-greeting", prompt),
  testModel: (model) => ipcRenderer.invoke("pet:test-model", model),
  checkCapabilities: () => ipcRenderer.invoke("pet:check-capabilities"),
  repairCapability: (actionId, rowId) => ipcRenderer.invoke("pet:repair-capability", actionId, rowId),
  checkUpdates: () => ipcRenderer.invoke("pet:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("pet:download-update"),
  installUpdate: () => ipcRenderer.invoke("pet:install-update"),
  checkNotices: () => ipcRenderer.invoke("pet:check-notices"),
  markNoticeRead: (noticeId) => ipcRenderer.invoke("pet:mark-notice-read", noticeId),
  openManager: () => ipcRenderer.invoke("pet:open-manager"),
  chooseWorkspace: () => ipcRenderer.invoke("pet:choose-workspace"),
  switchProject: (projectId) => ipcRenderer.invoke("pet:switch-project", projectId),
  deleteProject: (projectId) => ipcRenderer.invoke("pet:delete-project", projectId),
  listSkills: () => ipcRenderer.invoke("pet:list-skills"),
  importSkillFolder: () => ipcRenderer.invoke("pet:import-skill-folder"),
  updateSkill: (skillId, patch) => ipcRenderer.invoke("pet:update-skill", skillId, patch),
  removeSkill: (skillId) => ipcRenderer.invoke("pet:remove-skill", skillId),
  getProjectMemory: (projectId) => ipcRenderer.invoke("pet:get-project-memory", projectId),
  updateProjectMemory: (update) => ipcRenderer.invoke("pet:update-project-memory", update),
  openOutputFile: (path) => ipcRenderer.invoke("pet:open-output-file", path),
  showOutputFile: (path) => ipcRenderer.invoke("pet:show-output-file", path),
  setPetWindowBounds: (bounds) => ipcRenderer.invoke("pet:set-window-bounds", petSlot, bounds),
  getPetWindowBounds: () => ipcRenderer.invoke("pet:get-window-bounds", petSlot),
  movePetTo: (command) => ipcRenderer.invoke("pet:move-pet-to", petSlot, command),
  setChatOpen: (open) => ipcRenderer.invoke("pet:set-chat-open", petSlot, open),
  setMousePassthrough: (passthrough) => ipcRenderer.invoke("pet:set-mouse-passthrough", petSlot, passthrough),
  getCursorScreenPoint: () => ipcRenderer.invoke("pet:get-cursor-screen-point"),
  getSystemStatus: () => ipcRenderer.invoke("pet:get-system-status"),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pet:state-changed", listener);
    return () => ipcRenderer.off("pet:state-changed", listener);
  },
  onPlayCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("pet:play-command", listener);
    return () => ipcRenderer.off("pet:play-command", listener);
  },
  onKeyboardControl: (callback) => {
    const listener = (_event, key) => callback(key);
    ipcRenderer.on("pet:keyboard-control", listener);
    return () => ipcRenderer.off("pet:keyboard-control", listener);
  },
  onOutsideInteraction: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("pet:outside-interaction", listener);
    return () => ipcRenderer.off("pet:outside-interaction", listener);
  },
  onExternalPetActions: (callback) => {
    const listener = (_event, actions) => callback(actions);
    ipcRenderer.on("pet:external-actions", listener);
    return () => ipcRenderer.off("pet:external-actions", listener);
  }
});
