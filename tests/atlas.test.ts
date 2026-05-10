import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_FRAME_COUNTS, getAnimationFrameCount, getAtlasFrame } from "../src/lib/atlas";

describe("atlas helpers", () => {
  it("calculates the first idle frame from an 8 by 9 sheet", () => {
    expect(getAtlasFrame({ width: 1536, height: 1872 }, "idle", 0)).toEqual({
      sx: 0,
      sy: 0,
      sw: 192,
      sh: 208
    });
  });

  it("wraps frame indexes inside the 8 column row", () => {
    expect(getAtlasFrame({ width: 1536, height: 1872 }, "failed", 15)).toEqual({
      sx: 1344,
      sy: 1040,
      sw: 192,
      sh: 208
    });
  });

  it("wraps frame indexes inside a shorter animation frame count", () => {
    expect(getAtlasFrame({ width: 1536, height: 1872 }, "idle", 7, 6)).toEqual({
      sx: 192,
      sy: 0,
      sw: 192,
      sh: 208
    });
  });

  it("uses the HaJiMi atlas frame counts when an imported pet manifest omits them", () => {
    expect(DEFAULT_ANIMATION_FRAME_COUNTS).toMatchObject({
      idle: 6,
      waving: 4,
      jumping: 5,
      waiting: 6,
      running: 6,
      review: 5
    });
    expect(getAnimationFrameCount(undefined, "waving")).toBe(4);
    expect(getAnimationFrameCount({}, "review")).toBe(5);
  });

  it("clamps custom imported frame counts to the 8-column atlas", () => {
    expect(getAnimationFrameCount({ idle: 99 }, "idle")).toBe(8);
    expect(getAnimationFrameCount({ idle: 0 }, "idle")).toBe(1);
    expect(getAnimationFrameCount({ idle: 3 }, "idle")).toBe(3);
  });
});
