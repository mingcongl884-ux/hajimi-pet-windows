import { describe, expect, it } from "vitest";
import { getDesktopEventCue } from "../src/lib/desktopEventCues";

describe("desktop event cues", () => {
  it("warns about offline, low battery, and high memory situations", () => {
    expect(getDesktopEventCue({
      online: false,
      seenCueKeys: new Set()
    })?.key).toBe("offline");

    expect(getDesktopEventCue({
      online: true,
      battery: { charging: false, level: 0.12 },
      seenCueKeys: new Set()
    })?.key).toBe("lowBattery");

    expect(getDesktopEventCue({
      online: true,
      memory: { totalBytes: 100, freeBytes: 8 },
      seenCueKeys: new Set()
    })?.key).toBe("highMemory");
  });

  it("respects seen cue cooldown keys", () => {
    expect(getDesktopEventCue({
      online: false,
      seenCueKeys: new Set(["offline"])
    })).toBeUndefined();
  });
});
