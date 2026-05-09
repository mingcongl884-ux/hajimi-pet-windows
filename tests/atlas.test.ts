import { describe, expect, it } from "vitest";
import { getAtlasFrame } from "../src/lib/atlas";

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
});
