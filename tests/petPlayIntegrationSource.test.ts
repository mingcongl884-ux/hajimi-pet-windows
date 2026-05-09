import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");
const petStageSource = readFileSync(join(process.cwd(), "src", "components", "PetStage.tsx"), "utf8");
const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");
const settingsPanelSource = readFileSync(join(process.cwd(), "src", "components", "SettingsPanel.tsx"), "utf8");

describe("pet play integration source", () => {
  it("broadcasts play commands from the main process to pet windows", () => {
    expect(mainSource).toContain("planPetPlayStep");
    expect(mainSource).toContain('"pet:play-command"');
    expect(mainSource).toContain("startPetPlayLoop");
  });

  it("exposes play command subscriptions to the renderer", () => {
    expect(preloadSource).toContain("onPlayCommand");
    expect(preloadSource).toContain('"pet:play-command"');
    expect(globalSource).toContain("PetPlayCommand");
    expect(globalSource).toContain("onPlayCommand(callback");
  });

  it("lets the pet stage follow temporary play commands", () => {
    expect(petStageSource).toContain("playCommandRef");
    expect(petStageSource).toContain("onPlayCommand");
    expect(petStageSource).toContain("durationMs");
  });

  it("adds a multi-pet play toggle to both settings surfaces", () => {
    expect(managerSource).toContain("playTogetherEnabled");
    expect(settingsPanelSource).toContain("playTogetherEnabled");
  });
});
