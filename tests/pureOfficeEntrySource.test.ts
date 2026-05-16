import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pure office entry source", () => {
  it("keeps pet chat as a current-office bubble instead of a separate chat mode", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    const mainSource = readFileSync("electron/main.ts", "utf8");
    const preloadSource = readFileSync("electron/preload.ts", "utf8");
    const preloadCjsSource = readFileSync("electron/preload.cjs", "utf8");
    const globalSource = readFileSync("src/global.d.ts", "utf8");

    expect(appSource).toContain('import PetChatBubble from "./components/PetChatBubble"');
    expect(appSource).toContain("<PetChatBubble");
    expect(appSource).not.toContain("async function sendMessage");
    expect(appSource).toContain("function openPetChat");
    expect(appSource).toContain("onOpen={openPetChat}");
    expect(appSource).toContain("onClick={openPetChat}");
    expect(appSource).toContain("onSend={sendOfficeMessage}");
    expect(appSource).not.toContain("onClick={openOffice}");
    expect(mainSource).toContain('ipcMain.handle("pet:open-manager"');
    expect(preloadSource).toContain('openManager: () => ipcRenderer.invoke("pet:open-manager")');
    expect(preloadCjsSource).toContain('openManager: () => ipcRenderer.invoke("pet:open-manager")');
    expect(globalSource).toContain("openManager(): Promise<void>");
  });
});
