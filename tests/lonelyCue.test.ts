import { describe, expect, it } from "vitest";
import { getLonelyCue } from "../src/lib/lonelyCue";

describe("lonely pet cue", () => {
  it("uses the crying animation after a long quiet period", () => {
    const cue = getLonelyCue({
      idleMs: 46 * 60 * 1000,
      busy: false,
      chatOpen: false,
      bubbleOpen: false,
      movementEnabled: false,
      now: new Date(2026, 4, 10, 16, 20),
      lastCueAt: 0
    });

    expect(cue?.status).toBe("failed");
    expect(cue?.tone).toBe("info");
    expect(cue?.bubble).toMatch(/忘了哈基Mi|好久没说话|有点委屈/);
  });

  it("stays quiet while busy, moving, or recently cued", () => {
    const base = {
      idleMs: 46 * 60 * 1000,
      busy: false,
      chatOpen: false,
      bubbleOpen: false,
      movementEnabled: false,
      now: new Date(2026, 4, 10, 16, 20),
      lastCueAt: 0
    };

    expect(getLonelyCue({ ...base, busy: true })).toBeUndefined();
    expect(getLonelyCue({ ...base, movementEnabled: true })).toBeUndefined();
    expect(getLonelyCue({ ...base, lastCueAt: base.now.getTime() - 20 * 60 * 1000 })).toBeUndefined();
  });
});
