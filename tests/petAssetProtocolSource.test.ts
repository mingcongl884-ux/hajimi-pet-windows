import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const petStageSource = readFileSync(join(process.cwd(), "src", "components", "PetStage.tsx"), "utf8");

describe("pet asset protocol source", () => {
  it("serves spritesheets directly with an image/webp content type", () => {
    expect(mainSource).toContain("await readFile(assetPath)");
    expect(mainSource).toContain('"Content-Type": "image/webp"');
    expect(mainSource).not.toContain("return net.fetch(pathToFileURL(join(petsDir(), petId, requestedFile)).toString())");
  });

  it("logs spritesheet image load failures from the pet renderer", () => {
    expect(petStageSource).toContain("image.onerror");
    expect(petStageSource).toContain("Failed to load pet spritesheet");
  });
});
