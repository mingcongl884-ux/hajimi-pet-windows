import { describe, expect, it } from "vitest";
import { getWorkRhythmCue } from "../src/lib/workRhythm";

describe("work rhythm cues", () => {
  it("nudges the pet around lunchtime when the user is still active", () => {
    const cue = getWorkRhythmCue({
      now: localDate(2026, 5, 8, 12, 15),
      activeRecently: true,
      bubbleOpen: false,
      seenCueKeys: new Set()
    });

    expect(cue?.kind).toBe("lunchNudge");
    expect(cue?.tone).toBe("info");
    expect(cue?.followCursor).toBe(false);
    expect(cue?.followStatus).toBe("waving");
  });

  it("gently interrupts after hours when the user is still active", () => {
    const cue = getWorkRhythmCue({
      now: localDate(2026, 5, 8, 18, 40),
      activeRecently: true,
      bubbleOpen: false,
      seenCueKeys: new Set()
    });

    expect(cue?.kind).toBe("afterHoursNudge");
    expect(cue?.tone).toBe("working");
    expect(cue?.followCursor).toBe(true);
  });

  it("stays quiet when the user is idle or a bubble is already open", () => {
    expect(getWorkRhythmCue({
      now: localDate(2026, 5, 8, 12, 15),
      activeRecently: false,
      bubbleOpen: false,
      seenCueKeys: new Set()
    })).toBeUndefined();

    expect(getWorkRhythmCue({
      now: localDate(2026, 5, 8, 18, 40),
      activeRecently: true,
      bubbleOpen: true,
      seenCueKeys: new Set()
    })).toBeUndefined();
  });

  it("only cues once per day for the same reminder kind", () => {
    expect(getWorkRhythmCue({
      now: localDate(2026, 5, 8, 12, 20),
      activeRecently: true,
      bubbleOpen: false,
      seenCueKeys: new Set(["2026-05-08:lunchNudge"])
    })).toBeUndefined();
  });
});

function localDate(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
