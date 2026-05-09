import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const stageSource = readFileSync(join(process.cwd(), "src", "components", "PetStage.tsx"), "utf8");
const stylesSource = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");

describe("pet interaction source", () => {
  it("does not render the old always-visible floating action buttons", () => {
    expect(appSource).not.toContain('className="floating-actions"');
  });

  it("renders hover-only pet action buttons from the pet stage", () => {
    expect(stageSource).toContain("pet-hover-actions");
    expect(stageSource).toContain("hoverActions");
  });

  it("does not add a synthetic shadow around pet sprites", () => {
    expect(stylesSource).toContain(".pet-canvas");
    expect(stylesSource).not.toContain("filter: drop-shadow");
  });

  it("keeps the confirmed Codex-like bubble placement around the pet", () => {
    expect(stylesSource).toContain("--pet-anchor-x: 495px");
    expect(stylesSource).toContain("--bubble-x: 25px");
    expect(stylesSource).toContain("--bubble-y: 277px");
    expect(stylesSource).toContain("--bubble-width: 404px");
    expect(stylesSource).toMatch(/\.pet-bubble\s*\{[\s\S]*border-radius: 14px/);
  });

  it("keeps transparent pet-window areas click-through", () => {
    expect(mainSource).toContain("setIgnoreMouseEvents");
    expect(mainSource).toContain('"pet:set-mouse-passthrough"');
    expect(preloadSource).toContain("setMousePassthrough");
    expect(globalSource).toContain("setMousePassthrough(passthrough: boolean)");
    expect(appSource).toContain("syncMousePassthrough");
    expect(appSource).toContain(".pet-canvas, .pet-hover-actions, .pet-bubble, .chat-panel, .settings-panel");
  });

  it("places the chat panel close to the pet instead of the far left edge", () => {
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*left: 108px/);
    expect(stylesSource).toMatch(/\.chat-panel\s*\{[\s\S]*width: 300px/);
  });
});
