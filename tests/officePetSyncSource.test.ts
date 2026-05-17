import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("office pet sync source", () => {
  it("broadcasts office lifecycle feedback to the visible desktop pet", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const global = readFileSync("src/global.d.ts", "utf8");

    expect(app).toContain("dispatchOfficePetFeedback(\"started\")");
    expect(app).toContain("scheduleOfficeLongFeedback(requestId)");
    expect(app).toContain("dispatchOfficePetFeedback(\"completed\"");
    expect(app).toContain("dispatchOfficePetFeedback(\"failed\")");
    expect(app).toContain("dispatchOfficePetFeedback(\"cancelled\")");
    expect(app).toContain("emitExternalPetActions(actions)");
    expect(main).toContain("pet:emit-external-actions");
    expect(main).toContain("broadcastExternalPetActions(actions)");
    expect(preload).toContain("emitExternalPetActions");
    expect(global).toContain("emitExternalPetActions(actions: PetAction[]): Promise<void>");
  });
});
