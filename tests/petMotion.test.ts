import { describe, expect, it } from "vitest";
import { buildPetJumpCommand, buildPetMoveCommand, resolveEdgePosition, resolveVisiblePetPosition } from "../src/lib/petMotion";

describe("pet motion", () => {
  it("resolves screen edge targets away from the edge instead of teleporting blindly", () => {
    const screen = { width: 1920, height: 1080 };
    const windowBounds = { x: 600, y: 300, width: 620, height: 520 };

    expect(resolveEdgePosition("topRight", screen, windowBounds, 0.5)).toEqual({ x: 1377, y: -404 });
    expect(resolveEdgePosition("left", screen, windowBounds, 0.5)).toEqual({ x: -447, y: 84 });
    expect(resolveEdgePosition("center", screen, windowBounds, 0.5)).toEqual({ x: 465, y: 84 });
  });

  it("builds a smooth movement command with autonomous-behavior pacing", () => {
    const command = buildPetMoveCommand({ x: 100, y: 100 }, { x: 800, y: 120 });

    expect(command.target).toEqual({ x: 800, y: 120 });
    expect(command.animation).toBe("runRight");
    expect(command.durationMs).toBeGreaterThanOrEqual(4500);
    expect(command.durationMs).toBeLessThanOrEqual(5200);
  });

  it("converts visible pet-body coordinates into the larger transparent window coordinates", () => {
    expect(resolveVisiblePetPosition({ x: 0, y: 300 }, 0.5)).toEqual({ x: -447, y: -104 });
  });

  it("builds a jump command that keeps the landing point and adds a jump arc", () => {
    const command = buildPetJumpCommand({ x: 320, y: 420 });

    expect(command.target).toEqual({ x: 320, y: 420 });
    expect(command.animation).toBe("jumping");
    expect(command.durationMs).toBeGreaterThanOrEqual(800);
    expect(command.jumpHeight).toBeGreaterThanOrEqual(60);
  });
});
