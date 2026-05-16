import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeEffectsSource = readFileSync("src/hooks/usePetRuntimeEffects.ts", "utf8");

describe("work rhythm source", () => {
  it("uses the shared timed status reset so bubble rerenders cannot leave the pet waving", () => {
    expect(runtimeEffectsSource).toContain("runtimeRef.current.setTimedPetStatus(cue.followStatus");
    expect(runtimeEffectsSource).not.toContain('setStatus(cue.followStatus);\n            pendingTimeouts.push(window.setTimeout(() => setStatus("idle"), 1000));');
    expect(runtimeEffectsSource).not.toContain('setStatus(cue.followStatus);\n        pendingTimeouts.push(window.setTimeout(() => setStatus("idle"), 1000));');
  });
});
