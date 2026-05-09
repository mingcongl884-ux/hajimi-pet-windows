import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  safeStorage,
  screen,
  Tray
} from "electron";
import type { OpenDialogOptions } from "electron";
import { appendFile, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentTask } from "./agentClient.js";
import { runClaudeAgentTask, testClaudeAgentModel } from "./claudeAgentClient.js";
import { sendChatMessage, type ChatMessage } from "./chatClient.js";
import {
  checkForAppUpdates,
  checkRemoteNotices,
  downloadAppUpdate,
  installDownloadedUpdate,
  markNoticeRead
} from "./networkClient.js";
import { importPetBundle } from "./petImporter.js";
import { SettingsStore, type AppSettings, type ModelProfile } from "./settingsStore.js";
import { getActiveModelSettings } from "../src/lib/modelProfiles.js";
import { planPetPlayStep } from "../src/lib/petPlay.js";
import type { InstalledPet, PetManifest } from "../src/lib/petTypes.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const PET_WINDOW_SIZE = { width: 620, height: 520 };
const PET_ASSET_PROTOCOL = "pet-asset";

const petWindows = new Map<number, BrowserWindow>();
let managerWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let settingsStore: SettingsStore;
let lastPositionSave = 0;
let isQuitting = false;
let petPlayInterval: NodeJS.Timeout | undefined;
let petPlayTick = 0;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

async function createWindows() {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId("com.codex.xiaomipet");
  settingsStore = new SettingsStore(app.getPath("userData"), safeStorage);
  await ensureBundledPet();
  registerPetAssetProtocol();
  const settings = await settingsStore.loadSettings();
  await reconcilePetWindows(settings);
  await createManagerWindow();
  createTray();
  startPetPlayLoop();
}

async function createPetWindow(slot: number, settings: AppSettings) {
  const position = clampWindowPosition(
    settings.petWindowPositions?.[String(slot)] ?? settings.windowPosition ?? defaultWindowPosition(slot)
  );

  const petWindow = new BrowserWindow({
    width: PET_WINDOW_SIZE.width,
    height: PET_WINDOW_SIZE.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: appIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath()
    }
  });
  attachWindowLogging(petWindow, "pet");

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  if (process.env.VITE_DEV_SERVER_URL) {
    await petWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?mode=pet&slot=${slot}`);
  } else {
    await petWindow.loadFile(join(dirname, "../../dist/renderer/index.html"), { query: { mode: "pet", slot: String(slot) } });
  }

  petWindows.set(slot, petWindow);
}

async function createManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show();
    managerWindow.focus();
    return;
  }

  managerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "哈基Mi 管理",
    backgroundColor: "#f6f4ef",
    icon: appIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath()
    }
  });
  attachWindowLogging(managerWindow, "manager");
  managerWindow.once("ready-to-show", () => {
    managerWindow?.center();
    managerWindow?.show();
    managerWindow?.focus();
  });

  managerWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      managerWindow?.hide();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await managerWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?mode=manager`);
  } else {
    await managerWindow.loadFile(join(dirname, "../../dist/renderer/index.html"), { query: { mode: "manager" } });
  }
}

function attachWindowLogging(window: BrowserWindow, name: string) {
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void writeRuntimeLog(`${name} did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    void writeRuntimeLog(`${name} render-process-gone ${JSON.stringify(details)}`);
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    void writeRuntimeLog(`${name} console level=${level} ${sourceId}:${line} ${message}`);
  });
  window.webContents.on("did-finish-load", () => {
    void writeRuntimeLog(`${name} did-finish-load ${window.webContents.getURL()}`);
  });
}

async function writeRuntimeLog(message: string) {
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await appendFile(join(app.getPath("userData"), "runtime.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Logging must never break app launch.
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(appIconPath()).resize({
    width: 16,
    height: 16
  });
  tray = new Tray(icon);
  tray.setToolTip("哈基Mi");
  refreshTray();
}

function refreshTray() {
  const anyPetVisible = [...petWindows.values()].some((window) => window.isVisible());
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: anyPetVisible ? "隐藏哈基Mi" : "显示哈基Mi",
        click: () => {
          if (anyPetVisible) {
            for (const window of petWindows.values()) {
              window.hide();
            }
          } else {
            for (const window of petWindows.values()) {
              window.show();
            }
          }
          refreshTray();
        }
      },
      { label: "导入宠物", click: () => void importPetFromDialog() },
      { label: "打开管理页", click: () => void createManagerWindow() },
      { label: "切换自主走动", click: () => void toggleMovement() },
      { type: "separator" },
      { label: "退出", click: () => {
        isQuitting = true;
        app.quit();
      } }
    ])
  );
}

function registerIpc() {
  ipcMain.handle("pet:get-initial-state", (_event, slot = 0) => getAppStateForSlot(Number(slot) || 0));
  ipcMain.handle("pet:import", () => importPetFromDialog());
  ipcMain.handle("pet:delete", async (_event, petId: string) => deleteImportedPet(petId));
  ipcMain.handle("pet:switch", async (_event, petId: string) => {
    const settings = await settingsStore.loadSettings();
    await settingsStore.saveSettings({ ...settings, activePetId: petId });
    return broadcastState();
  });
  ipcMain.handle("pet:save-settings", async (_event, settings: AppSettings) => {
    await settingsStore.saveSettings(settings);
    refreshTray();
    return broadcastState();
  });
  ipcMain.handle("pet:send-chat", async (_event, messages: ChatMessage[]) => {
    const settings = await settingsStore.loadSettings();
    return sendChatMessage(fetch, getActiveModelSettings(settings, "chat"), messages);
  });
  ipcMain.handle("pet:run-agent-task", async (_event, task: string) => {
    const settings = await settingsStore.loadSettings();
    const model = getActiveModelSettings(settings, "agent");
    return model.provider === "claude-agent"
      ? runClaudeAgentTask(model, settings.agent, task)
      : runAgentTask(fetch, model, settings.agent, task);
  });
  ipcMain.handle("pet:heartbeat-greeting", async (_event, prompt: string) => {
    const settings = await settingsStore.loadSettings();
    return sendChatMessage(fetch, getActiveModelSettings(settings, "chat"), [{ role: "user", content: prompt }]);
  });
  ipcMain.handle("pet:test-model", async (_event, model: ModelProfile) => {
    if (model.provider === "claude-agent") {
      return testClaudeAgentModel(model);
    }
    const response = await sendChatMessage(fetch, model, [{ role: "user", content: "Reply with OK." }]);
    return response.content;
  });
  ipcMain.handle("pet:check-updates", async () => {
    const settings = await settingsStore.loadSettings();
    const result = await checkForAppUpdates(settings.network);
    await settingsStore.saveSettings({
      ...settings,
      network: {
        ...settings.network,
        lastUpdateCheckAt: new Date().toISOString()
      }
    });
    return result;
  });
  ipcMain.handle("pet:download-update", async () => {
    const settings = await settingsStore.loadSettings();
    return downloadAppUpdate(settings.network);
  });
  ipcMain.handle("pet:install-update", () => installDownloadedUpdate());
  ipcMain.handle("pet:check-notices", async () => {
    const settings = await settingsStore.loadSettings();
    const result = await checkRemoteNotices(settings.network);
    await settingsStore.saveSettings({
      ...settings,
      network: {
        ...settings.network,
        lastNoticeCheckAt: result.checkedAt
      }
    });
    return result;
  });
  ipcMain.handle("pet:mark-notice-read", async (_event, noticeId: string) => {
    const settings = await settingsStore.loadSettings();
    await settingsStore.saveSettings(markNoticeRead(settings, noticeId));
    return broadcastState();
  });
  ipcMain.handle("pet:choose-workspace", () => chooseWorkspaceFromDialog());
  ipcMain.handle("pet:set-window-bounds", async (_event, slot: number, bounds: { x: number; y: number }) => {
    setPetWindowPosition(slot, bounds.x, bounds.y);
  });
  ipcMain.handle("pet:set-mouse-passthrough", (_event, slot: number, passthrough: boolean) => {
    petWindows.get(slot)?.setIgnoreMouseEvents(passthrough, { forward: true });
  });
}

async function deleteImportedPet(petId: string) {
  if (petId === "xiaomi") {
    throw new Error("内置哈基Mi不能删除。");
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/i.test(petId)) {
    throw new Error("宠物 ID 无效。");
  }

  const targetDir = resolvePetInstallDir(petId);
  await rm(targetDir, { recursive: true, force: true });

  const settings = await settingsStore.loadSettings();
  const activePetIds = (settings.activePetIds?.length ? settings.activePetIds : [settings.activePetId])
    .filter((id) => id !== petId);
  const { [petId]: _deletedName, ...petDisplayNames } = settings.petDisplayNames ?? {};
  await settingsStore.saveSettings({
    ...settings,
    activePetId: activePetIds[0] ?? "xiaomi",
    activePetIds: activePetIds.length ? activePetIds : ["xiaomi"],
    petDisplayNames
  });

  return broadcastState();
}

async function importPetFromDialog() {
  const dialogOptions: OpenDialogOptions = {
    title: "导入宠物",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Pet bundle", extensions: ["zip"] }]
  };
  const parent = primaryPetWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) {
    return getAppState();
  }

  const imported = await importPetBundle(result.filePaths[0], petsDir(), true);
  const settings = await settingsStore.loadSettings();
  await settingsStore.saveSettings({ ...settings, activePetId: imported.petId });
  return broadcastState();
}

async function toggleMovement() {
  const settings = await settingsStore.loadSettings();
  await settingsStore.saveSettings({ ...settings, movementEnabled: !settings.movementEnabled });
  await broadcastState();
}

async function chooseWorkspaceFromDialog() {
  const dialogOptions: OpenDialogOptions = {
    title: "选择哈基Mi办公区",
    properties: ["openDirectory"]
  };
  const parent = managerWindow && !managerWindow.isDestroyed() ? managerWindow : primaryPetWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) {
    return getAppState();
  }

  const settings = await settingsStore.loadSettings();
  await settingsStore.saveSettings({
    ...settings,
    agent: {
      ...settings.agent,
      workspaceDir: result.filePaths[0]
    }
  });
  return broadcastState();
}

async function getAppState() {
  return getAppStateForSlot(0);
}

async function getAppStateForSlot(slot: number) {
  const settings = await settingsStore.loadSettings();
  const pets = applyPetDisplayNames(await listInstalledPets(), settings);
  const activePetIds = settings.activePetIds?.length ? settings.activePetIds : [settings.activePetId];
  const activePetId = activePetIds[slot] ?? activePetIds[0];
  const activePet = pets.find((pet) => pet.id === activePetId) ?? pets[0];
  if (activePet && !activePetIds.includes(activePet.id)) {
    await settingsStore.saveSettings({ ...settings, activePetId: activePet.id, activePetIds: [activePet.id] });
  }
  const display = screen.getPrimaryDisplay().workArea;

  return {
    settings: activePet && activePet.id !== settings.activePetId
      ? { ...settings, activePetId: activePet.id, activePetIds }
      : settings,
    pets,
    activePet,
    activePets: activePetIds
      .map((petId) => pets.find((pet) => pet.id === petId))
      .filter(Boolean),
    screen: {
      width: display.width,
      height: display.height
    },
    windowBounds: petWindows.get(slot)?.getBounds() ?? { ...defaultWindowPosition(slot), ...PET_WINDOW_SIZE }
  };
}

async function broadcastState() {
  const state = await getAppState();
  for (const [slot, window] of petWindows) {
    window.webContents.send("pet:state-changed", await getAppStateForSlot(slot));
  }
  managerWindow?.webContents.send("pet:state-changed", state);
  await reconcilePetWindows(state.settings);
  return state;
}

function setPetWindowPosition(slot: number, x: number, y: number) {
  const position = clampWindowPosition({ x, y });
  petWindows.get(slot)?.setBounds({ x: position.x, y: position.y, ...PET_WINDOW_SIZE }, false);

  const now = Date.now();
  if (now - lastPositionSave > 2000) {
    lastPositionSave = now;
    void settingsStore.loadSettings().then((settings) =>
      settingsStore.saveSettings({
        ...settings,
        windowPosition: slot === 0 ? position : settings.windowPosition,
        petWindowPositions: {
          ...settings.petWindowPositions,
          [String(slot)]: position
        }
      })
    );
  }
}

async function reconcilePetWindows(settings: AppSettings) {
  const activePetIds = (settings.activePetIds?.length ? settings.activePetIds : [settings.activePetId]).slice(0, 2);
  for (const [slot, window] of petWindows) {
    if (slot >= activePetIds.length) {
      window.close();
      petWindows.delete(slot);
    }
  }
  for (let slot = 0; slot < activePetIds.length; slot += 1) {
    if (!petWindows.has(slot)) {
      await createPetWindow(slot, settings);
    }
  }
}

function startPetPlayLoop() {
  if (petPlayInterval) {
    return;
  }

  petPlayInterval = setInterval(() => {
    void broadcastPetPlayCommands();
  }, 900);
}

async function broadcastPetPlayCommands() {
  if (petWindows.size !== 2) {
    return;
  }

  const settings = await settingsStore.loadSettings();
  const activePetIds = (settings.activePetIds?.length ? settings.activePetIds : [settings.activePetId]).slice(0, 2);
  const display = screen.getPrimaryDisplay().workArea;
  const bounds = activePetIds
    .map((_petId, slot) => {
      const window = petWindows.get(slot);
      const current = window?.getBounds();
      return current && window?.isVisible()
        ? { slot, x: current.x, y: current.y, width: current.width, height: current.height }
        : undefined;
    })
    .filter((item): item is { slot: number; x: number; y: number; width: number; height: number } => Boolean(item));

  const commands = planPetPlayStep({
    enabled: settings.playTogetherEnabled,
    movementEnabled: settings.movementEnabled,
    chatOpen: false,
    bounds,
    screen: { width: display.width, height: display.height },
    tick: petPlayTick += 1
  });

  for (const command of commands) {
    petWindows.get(command.slot)?.webContents.send("pet:play-command", command);
  }
}

async function ensureBundledPet() {
  await mkdir(petsDir(), { recursive: true });
  const xiaomiDir = join(petsDir(), "xiaomi");
  await cp(join(assetsDir(), "pets", "xiaomi"), xiaomiDir, { recursive: true, force: true });
}

async function listInstalledPets(): Promise<InstalledPet[]> {
  await mkdir(petsDir(), { recursive: true });
  const entries = await readdir(petsDir(), { withFileTypes: true });
  const pets: InstalledPet[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(petsDir(), entry.name);
    try {
      const manifest = JSON.parse(await readFile(join(dir, "pet.json"), "utf8")) as PetManifest;
      const id = manifest.id || entry.name;
      pets.push({
        id,
        displayName: manifest.displayName || manifest.name || id,
        description: manifest.description,
        manifest,
        spritesheetUrl: `${PET_ASSET_PROTOCOL}://${encodeURIComponent(id)}/${encodeURIComponent(
          manifest.spritesheetPath || "spritesheet.webp"
        )}`
      });
    } catch {
      // Ignore incomplete pet folders so one bad import does not break launch.
    }
  }

  return pets.sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
}

function applyPetDisplayNames(pets: InstalledPet[], settings: AppSettings): InstalledPet[] {
  return pets
    .map((pet) => {
      if (pet.id === "xiaomi") {
        return { ...pet, displayName: "哈基Mi" };
      }
      const displayName = settings.petDisplayNames?.[pet.id]?.trim();
      return displayName ? { ...pet, displayName } : pet;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
}

function registerPetAssetProtocol() {
  if (protocol.isProtocolHandled(PET_ASSET_PROTOCOL)) {
    return;
  }

  protocol.handle(PET_ASSET_PROTOCOL, async (request) => {
    const url = new URL(request.url);
    const petId = decodeURIComponent(url.hostname);
    const requestedFile = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/i.test(petId) || requestedFile !== "spritesheet.webp") {
      void writeRuntimeLog(`pet-asset invalid ${request.url}`);
      return new Response("Invalid pet asset.", { status: 400 });
    }

    const assetPath = join(petsDir(), petId, requestedFile);
    try {
      const bytes = await readFile(assetPath);
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      void writeRuntimeLog(`pet-asset missing ${assetPath} ${error instanceof Error ? error.message : String(error)}`);
      return new Response("Pet asset not found.", { status: 404 });
    }
  });
}

function primaryPetWindow() {
  return petWindows.get(0) ?? [...petWindows.values()][0];
}

function defaultWindowPosition(slot = 0) {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    x: display.x + display.width - PET_WINDOW_SIZE.width - 40 - slot * 220,
    y: display.y + display.height - PET_WINDOW_SIZE.height - 40
  };
}

function clampWindowPosition(position: { x: number; y: number }) {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.min(Math.max(display.x, Math.round(position.x)), display.x + display.width - PET_WINDOW_SIZE.width),
    y: Math.min(Math.max(display.y, Math.round(position.y)), display.y + display.height - PET_WINDOW_SIZE.height)
  };
}

function assetsDir() {
  return app.isPackaged ? join(process.resourcesPath, "assets") : join(app.getAppPath(), "assets");
}

function appIconPath() {
  return join(assetsDir(), "icons", "app-icon.png");
}

function petsDir() {
  return join(app.getPath("userData"), "pets");
}

function resolvePetInstallDir(petId: string) {
  const root = resolve(petsDir());
  const target = resolve(root, petId);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget !== normalizedRoot && normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    return target;
  }
  throw new Error("宠物目录解析失败。");
}

function preloadPath() {
  return app.isPackaged ? join(app.getAppPath(), "electron", "preload.cjs") : join(app.getAppPath(), "electron", "preload.cjs");
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: PET_ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

registerIpc();

app.on("second-instance", () => {
  for (const window of petWindows.values()) {
    window.show();
  }
  void createManagerWindow();
});

app.whenReady().then(createWindows);

app.on("activate", () => {
  if (petWindows.size === 0) {
    void createWindows();
  } else {
    void createManagerWindow();
  }
});

app.on("window-all-closed", () => undefined);

app.on("before-quit", () => {
  if (petPlayInterval) {
    clearInterval(petPlayInterval);
  }
});
