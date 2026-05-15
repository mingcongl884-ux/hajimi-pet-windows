import { describe, expect, it } from "vitest";
import {
  directionFromPetControlKeys,
  isEditableKeyboardTarget,
  normalizePetControlKey,
  stepKeyboardControlledPet
} from "../src/lib/petKeyboardControl";

describe("pet keyboard control", () => {
  it("supports WASD and arrow keys from both sides of the keyboard", () => {
    expect(normalizePetControlKey("w")).toBe("up");
    expect(normalizePetControlKey("W")).toBe("up");
    expect(normalizePetControlKey("ArrowUp")).toBe("up");
    expect(normalizePetControlKey("a")).toBe("left");
    expect(normalizePetControlKey("ArrowLeft")).toBe("left");
    expect(normalizePetControlKey("s")).toBe("down");
    expect(normalizePetControlKey("ArrowDown")).toBe("down");
    expect(normalizePetControlKey("d")).toBe("right");
    expect(normalizePetControlKey("ArrowRight")).toBe("right");
    expect(normalizePetControlKey(" ")).toBe("jump");
    expect(normalizePetControlKey("Enter")).toBeUndefined();
  });

  it("normalizes diagonal movement so it is not faster than straight movement", () => {
    const direction = directionFromPetControlKeys(new Set(["right", "down"]));

    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
    expect(direction.x).toBeGreaterThan(0);
    expect(direction.y).toBeGreaterThan(0);
  });

  it("moves the pet within bounds and chooses directional run animation", () => {
    const next = stepKeyboardControlledPet({
      keys: new Set(["left", "up"]),
      current: { x: 10, y: 10 },
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      deltaMs: 1000,
      speedPxPerSecond: 80,
      previousDirection: 1
    });

    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
    expect(next.direction).toBe(-1);
    expect(next.animation).toBe("runLeft");
  });

  it("keeps the previous facing direction for vertical movement", () => {
    const next = stepKeyboardControlledPet({
      keys: new Set(["up"]),
      current: { x: 50, y: 50 },
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      deltaMs: 250,
      speedPxPerSecond: 80,
      previousDirection: -1
    });

    expect(next.x).toBe(50);
    expect(next.y).toBe(30);
    expect(next.direction).toBe(-1);
    expect(next.animation).toBe("runLeft");
  });

  it("does not treat form fields as game control targets", () => {
    const input = { tagName: "input" } as unknown as EventTarget;
    const div = { tagName: "div", isContentEditable: true } as unknown as EventTarget;
    const canvas = { tagName: "canvas" } as unknown as EventTarget;

    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(div)).toBe(true);
    expect(isEditableKeyboardTarget(canvas)).toBe(false);
  });
});
