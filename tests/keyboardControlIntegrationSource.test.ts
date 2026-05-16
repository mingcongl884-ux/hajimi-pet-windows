import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const preloadCjsSource = readFileSync(join(process.cwd(), "electron", "preload.cjs"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");

describe("keyboard control integration", () => {
  it("captures game keys in the main process when control mode is active", () => {
    expect(mainSource).toContain("globalShortcut");
    expect(mainSource).toContain("PET_CONTROL_SHORTCUTS");
    expect(mainSource).toContain("refreshKeyboardControlShortcuts");
    expect(mainSource).toContain("settings.keyboardControlEnabled");
    expect(mainSource).toContain("registerPetKeyboardShortcuts");
    expect(mainSource).toContain('"pet:keyboard-control"');
  });

  it("does not capture typing while chat or manager interactions are active", () => {
    expect(mainSource).toContain("isAnyPetChatOpen(activePetIds.length)");
    expect(mainSource).toContain("isManagerWindowFocused()");
    expect(mainSource).toContain("unregisterPetKeyboardShortcuts");
  });

  it("exposes keyboard-control events to the pet renderer", () => {
    expect(preloadSource).toContain("onKeyboardControl");
    expect(preloadSource).toContain('"pet:keyboard-control"');
    expect(preloadCjsSource).toContain("onKeyboardControl");
    expect(globalSource).toContain("PetControlKey");
    expect(globalSource).toContain("onKeyboardControl(callback");
  });
});
