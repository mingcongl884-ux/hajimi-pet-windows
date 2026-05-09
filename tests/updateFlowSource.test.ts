import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const networkClientSource = readFileSync(join(process.cwd(), "electron", "networkClient.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const preloadCjsSource = readFileSync(join(process.cwd(), "electron", "preload.cjs"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");
const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");

describe("in-app update flow source", () => {
  it("exposes update download and install actions through IPC", () => {
    expect(networkClientSource).toContain("downloadAppUpdate");
    expect(networkClientSource).toContain("installDownloadedUpdate");
    expect(networkClientSource).toContain("autoUpdater.downloadUpdate()");
    expect(networkClientSource).toContain("autoUpdater.quitAndInstall");
    expect(mainSource).toContain('"pet:download-update"');
    expect(mainSource).toContain('"pet:install-update"');
    expect(preloadSource).toContain("downloadUpdate: () => ipcRenderer.invoke(\"pet:download-update\")");
    expect(preloadSource).toContain("installUpdate: () => ipcRenderer.invoke(\"pet:install-update\")");
    expect(preloadCjsSource).toContain("downloadUpdate: () => ipcRenderer.invoke(\"pet:download-update\")");
    expect(preloadCjsSource).toContain("installUpdate: () => ipcRenderer.invoke(\"pet:install-update\")");
    expect(globalSource).toContain("downloadUpdate(): Promise<UpdateCheckResult>");
    expect(globalSource).toContain("installUpdate(): Promise<UpdateCheckResult>");
  });

  it("lets users complete updates from the system page without opening GitHub", () => {
    expect(appSource).toContain("onDownloadUpdate={() => window.petApp.downloadUpdate()}");
    expect(appSource).toContain("onInstallUpdate={() => window.petApp.installUpdate()}");
    expect(managerSource).toContain("onDownloadUpdate(): Promise<UpdateCheckResult>");
    expect(managerSource).toContain("onInstallUpdate(): Promise<UpdateCheckResult>");
    expect(managerSource).toContain("下载更新");
    expect(managerSource).toContain("重启安装");
  });
});
