import { describe, expect, it } from "vitest";
import { shouldPauseNaturalMovement } from "../src/lib/petStageRuntime";

describe("pet stage runtime", () => {
  it("pauses autonomous movement while a status override is being expressed", () => {
    expect(shouldPauseNaturalMovement({
      animationOverride: "failed",
      dragging: false,
      playActive: false
    })).toBe(true);
  });

  it("does not pause commanded movement or dragging", () => {
    expect(shouldPauseNaturalMovement({
      animationOverride: "jumping",
      dragging: false,
      playActive: true
    })).toBe(false);
    expect(shouldPauseNaturalMovement({
      animationOverride: "failed",
      dragging: true,
      playActive: false
    })).toBe(false);
  });
});
