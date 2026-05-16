import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const stageSource = readFileSync(join(process.cwd(), "src", "components", "PetStage.tsx"), "utf8");
const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");
const stylesSource = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const preloadCjsSource = readFileSync(join(process.cwd(), "electron", "preload.cjs"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");
const runtimeEffectsSource = readFileSync(join(process.cwd(), "src", "hooks", "usePetRuntimeEffects.ts"), "utf8");

describe("pet interaction source", () => {
  it("does not render the old always-visible floating action buttons", () => {
    expect(appSource).not.toContain('className="floating-actions"');
  });

  it("does not render the old pet-side hover action toolbar", () => {
    expect(appSource).not.toContain("hoverActions");
    expect(stageSource).not.toContain("pet-hover-actions");
    expect(stageSource).not.toContain("hoverActions");
    expect(stylesSource).not.toContain(".pet-hover-actions");
  });

  it("does not add a synthetic shadow around pet sprites", () => {
    expect(stylesSource).toContain(".pet-canvas");
    expect(stylesSource).not.toContain("filter: drop-shadow");
  });

  it("keeps the confirmed Codex-like bubble placement around the pet", () => {
    expect(stylesSource).toContain("--pet-anchor-x: 495px");
    expect(stylesSource).toContain("--bubble-x: 25px");
    expect(stylesSource).toContain("--bubble-y: 308px");
    expect(stylesSource).toContain("--bubble-width: 404px");
    expect(stylesSource).toMatch(/\.pet-bubble\s*\{[^}]*border-radius: 14px/);
    expect(stylesSource).toMatch(/\.pet-bubble\s*\{[^}]*box-shadow: none/);
  });

  it("auto-hides the bubble after a short idle window", () => {
    expect(runtimeEffectsSource).toContain("const BUBBLE_AUTO_HIDE_MS = 15000;");
    expect(runtimeEffectsSource).toMatch(/window\.setTimeout\(\(\) => runtimeRef\.current\.setBubble\(undefined\), BUBBLE_AUTO_HIDE_MS\)/);
  });

  it("never renders a reminder bubble at the same time as the chat panel", () => {
    expect(appSource).toContain("{bubble && !chatOpen && (");
  });

  it("keeps transparent pet-window areas click-through", () => {
    expect(mainSource).toContain("setIgnoreMouseEvents");
    expect(mainSource).toContain('"pet:set-mouse-passthrough"');
    expect(mainSource).toContain('"pet:move-pet-to"');
    expect(mainSource).toContain('"pet:get-cursor-screen-point"');
    expect(mainSource).toContain("screen.getCursorScreenPoint()");
    expect(preloadSource).toContain("setMousePassthrough");
    expect(preloadSource).toContain("getCursorScreenPoint");
    expect(preloadSource).toContain("movePetTo");
    expect(preloadCjsSource).toContain("movePetTo");
    expect(preloadCjsSource).toContain("getCursorScreenPoint");
    expect(preloadCjsSource).toContain('"pet:move-pet-to"');
    expect(globalSource).toContain("setMousePassthrough(passthrough: boolean)");
    expect(globalSource).toContain("getCursorScreenPoint(): Promise");
    expect(globalSource).toContain("movePetTo");
    expect(appSource).toContain("syncMousePassthrough");
    expect(appSource).toContain("buildPetMoveCommand");
    expect(appSource).toContain(".pet-canvas, .pet-bubble, .chat-panel");
    expect(appSource).not.toContain(".pet-hover-actions");
  });

  it("places the chat panel close to the pet instead of the far left edge", () => {
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*left: 108px/);
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*top: 92px/);
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*width: 344px/);
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*min-height: 338px/);
  });

  it("releases transient chat status so model-controlled movement can animate", () => {
    expect(appSource).toContain("petActionStatusTimeoutRef");
    expect(appSource).toContain("function setTimedPetStatus");
    expect(appSource).toContain("function playPetMove");
    expect(appSource).toContain("getPetWindowBounds");
    expect(appSource).toContain("async function playPetJump");
    expect(appSource).toContain("async function playPetMoveToEdge");
    expect(appSource).toContain("setTimedPetStatus(command.animation, command.durationMs)");
    expect(appSource).toContain("petActionStatusTimeoutRef.current = window.setTimeout");
    expect(appSource).toContain('setStatus("idle");');
    expect(appSource).toContain("petActionStatusTimeoutRef.current = undefined");
    expect(preloadSource).toContain("getPetWindowBounds");
    expect(globalSource).toContain("getPetWindowBounds(): Promise");
    expect(appSource).toMatch(/if \(action\.type === "moveTo" && state\) \{[\s\S]*await playPetMoveToPoint/);
    expect(appSource).toMatch(/if \(action\.type === "moveToEdge" && state\) \{[\s\S]*await playPetMoveToEdge/);
  });

  it("dismisses chat and reminder bubbles when the user clicks elsewhere on the desktop", () => {
    expect(mainSource).toContain('"pet:outside-interaction"');
    expect(mainSource).toContain('petWindow.on("blur"');
    expect(preloadSource).toContain("onOutsideInteraction");
    expect(preloadCjsSource).toContain("onOutsideInteraction");
    expect(globalSource).toContain("onOutsideInteraction(callback");
    expect(appSource).toContain("function dismissFloatingPetUi");
    expect(appSource).toContain("window.petApp.onOutsideInteraction(dismissFloatingPetUi)");
    expect(appSource).toContain('window.addEventListener("pointerdown", dismissOnOutsidePointerDown, true)');
  });

  it("allows the pet size slider to shrink to a Codex-like small size", () => {
    expect(managerSource).toContain('min="0.5"');
    expect(managerSource).toContain('step="0.05"');
  });

  it("opens the manager in a wider default window", () => {
    expect(mainSource).toContain("width: 1280");
    expect(mainSource).toContain("height: 720");
  });
});
