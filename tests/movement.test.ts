import { describe, expect, it } from "vitest";
import { MovementController } from "../src/lib/movement";
import { PET_WINDOW_SIZE, getPetWindowMovementBounds } from "../src/lib/petWindowGeometry";

describe("MovementController", () => {
  it("keeps autonomous movement within screen bounds", () => {
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.4
    });

    controller.setEnabled(true);

    for (let index = 0; index < 300; index += 1) {
      controller.tick(100);
    }

    expect(controller.snapshot().x).toBeGreaterThanOrEqual(0);
    expect(controller.snapshot().x).toBeLessThanOrEqual(808);
    expect(controller.snapshot().y).toBeGreaterThanOrEqual(0);
    expect(controller.snapshot().y).toBeLessThanOrEqual(492);
  });

  it("moves vertically as well as horizontally during autonomous movement", () => {
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.7
    });

    controller.setPosition(200, 200);
    controller.setEnabled(true);

    controller.tick(1000);

    expect(controller.snapshot().x).not.toBe(200);
    expect(controller.snapshot().y).not.toBe(200);
  });

  it("does not move while the user is dragging the pet", () => {
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.2
    });

    controller.setEnabled(true);
    controller.tick(1000);
    controller.setDragging(true);
    const before = controller.snapshot();

    controller.tick(1000);

    expect(controller.snapshot()).toEqual(before);
  });

  it("uses directional running animation while the user drags the pet", () => {
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.2
    });

    controller.setDragging(true, -1);

    expect(controller.snapshot().animation).toBe("runLeft");
  });

  it("uses jumping animation with a visible hop during autonomous behavior", () => {
    const rolls = [0.93, 0, 0.7, 0.5];
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => rolls.shift() ?? 0.5
    });

    controller.setPosition(200, 300);
    controller.setEnabled(true);
    controller.tick(300);

    expect(controller.snapshot().animation).toBe("jumping");
    expect(controller.snapshot().y).toBeLessThan(300);
  });

  it("lands after an autonomous jump before continuing", () => {
    const rolls = [0.93, 0, 0.7, 0.1, 0.1];
    const controller = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => rolls.shift() ?? 0.1
    });

    controller.setPosition(200, 300);
    controller.setEnabled(true);
    controller.tick(1200);

    expect(controller.snapshot().y).toBe(300);
  });

  it("uses slower movement while chat is open", () => {
    const active = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.7
    });
    const chatting = new MovementController({
      screen: { width: 1000, height: 700 },
      pet: { width: 192, height: 208 },
      rng: () => 0.7
    });

    active.setEnabled(true);
    chatting.setEnabled(true);
    chatting.setChatOpen(true);
    active.setPosition(400, 300);
    chatting.setPosition(400, 300);

    active.tick(1000);
    chatting.tick(1000);

    const activeDistance = Math.hypot(active.snapshot().x - 400, active.snapshot().y - 300);
    const chattingDistance = Math.hypot(chatting.snapshot().x - 400, chatting.snapshot().y - 300);
    expect(activeDistance).toBeGreaterThan(chattingDistance);
  });

  it("allows the transparent pet window to move left of the screen while the visible body stays in bounds", () => {
    const bounds = getPetWindowMovementBounds({ width: 1920, height: 1080 }, PET_WINDOW_SIZE, 0.5);
    const controller = new MovementController({
      screen: { width: 1920, height: 1080 },
      pet: PET_WINDOW_SIZE,
      bounds,
      rng: () => 0.2
    });

    controller.setPosition(-999, 100);
    expect(controller.snapshot().x).toBe(bounds.minX);

    controller.setPosition(9999, 100);
    expect(controller.snapshot().x).toBe(bounds.maxX);
  });
});
