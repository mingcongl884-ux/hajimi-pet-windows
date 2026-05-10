import { describe, expect, it } from "vitest";
import {
  PET_WINDOW_SIZE,
  clampPetWindowPosition,
  getPetVisibleRect,
  getPetWindowMovementBounds
} from "../src/lib/petWindowGeometry";

describe("pet window geometry", () => {
  it("tracks the visible pet body inside the larger transparent window", () => {
    expect(getPetVisibleRect(0.5)).toEqual({
      left: 447,
      top: 404,
      width: 96,
      height: 104,
      right: 543,
      bottom: 508
    });
  });

  it("allows the transparent window to go off-screen so the visible pet can reach the left edge", () => {
    const screen = { width: 1920, height: 1080 };
    const bounds = getPetWindowMovementBounds(screen, PET_WINDOW_SIZE, 0.5);

    expect(bounds.minX).toBe(-447);
    expect(bounds.maxX).toBe(1377);
    expect(clampPetWindowPosition({ x: -999, y: 100 }, screen, PET_WINDOW_SIZE, 0.5)).toEqual({
      x: -447,
      y: 100
    });
  });
});
