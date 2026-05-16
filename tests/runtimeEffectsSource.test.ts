import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeEffectsSource = readFileSync("src/hooks/usePetRuntimeEffects.ts", "utf8");

describe("pet runtime effects source", () => {
  it("uses the shared heartbeat collapse decision", () => {
    expect(runtimeEffectsSource).toContain("shouldCollapseToBubble as shouldCollapseHeartbeatToBubble");
    expect(runtimeEffectsSource).not.toContain("function shouldCollapseToBubble(");
    expect(runtimeEffectsSource).toContain("shouldCollapseHeartbeatToBubble");
  });

  it("uses one recurring runtime interval scheduler", () => {
    expect(runtimeEffectsSource).toContain("createRuntimeSchedule");
    expect(runtimeEffectsSource.match(/window\.setInterval\(/g) ?? []).toHaveLength(1);
    expect(runtimeEffectsSource).toContain("function runMinuteTick");
    expect(runtimeEffectsSource.match(/60_000/g) ?? []).toHaveLength(1);
  });
});
