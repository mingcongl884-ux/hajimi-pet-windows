import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work rhythm source", () => {
  it("uses the shared timed status reset so bubble rerenders cannot leave the pet waving", () => {
    const source = readFileSync("src/App.tsx", "utf8");

    expect(source).toContain("setTimedPetStatus(cue.followStatus");
    expect(source).not.toContain('setStatus(cue.followStatus);\n            pendingTimeouts.push(window.setTimeout(() => setStatus("idle"), 1000));');
    expect(source).not.toContain('setStatus(cue.followStatus);\n        pendingTimeouts.push(window.setTimeout(() => setStatus("idle"), 1000));');
  });
});
