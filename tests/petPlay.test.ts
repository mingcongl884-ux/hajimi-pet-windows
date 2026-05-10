import { describe, expect, it } from "vitest";
import { planPetPlayStep } from "../src/lib/petPlay";
import { getPetVisibleRect } from "../src/lib/petWindowGeometry";

describe("pet play controller", () => {
  it("does not start play unless exactly two pets can interact", () => {
    expect(planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [{ slot: 0, x: 200, y: 200, width: 620, height: 520 }],
      screen: { width: 1200, height: 800 },
      tick: 1
    })).toEqual([]);

    expect(planPetPlayStep({
      enabled: false,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 200, y: 200, width: 620, height: 520 },
        { slot: 1, x: 680, y: 220, width: 620, height: 520 }
      ],
      screen: { width: 1200, height: 800 },
      tick: 1
    })).toEqual([]);
  });

  it("brings two pets closer without overlapping when play is enabled", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 120, y: 300, width: 620, height: 520 },
        { slot: 1, x: 820, y: 320, width: 620, height: 520 }
      ],
      screen: { width: 1440, height: 900 },
      tick: 1
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ slot: 0, animation: "runRight" });
    expect(commands[1]).toMatchObject({ slot: 1, animation: "runLeft" });
    expect(commands[0].target.x).toBeGreaterThan(120);
    expect(commands[1].target.x).toBeLessThan(820);
    expect(commands[1].target.x - commands[0].target.x).toBeGreaterThanOrEqual(140);
  });

  it("approaches by visible body centers so the pets actually look close", () => {
    const petScale = 0.5;
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 300, y: 360, width: 620, height: 520 },
        { slot: 1, x: 520, y: 370, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale,
      tick: 1
    });
    const visible = getPetVisibleRect(petScale);
    const firstCenterX = commands[0].target.x + visible.left + visible.width / 2;
    const secondCenterX = commands[1].target.x + visible.left + visible.width / 2;

    expect(secondCenterX - firstCenterX).toBeLessThanOrEqual(112);
  });

  it("sometimes asks both pets to jump together while already close", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 420, y: 300, width: 620, height: 520 },
        { slot: 1, x: 570, y: 310, width: 620, height: 520 }
      ],
      screen: { width: 1440, height: 900 },
      tick: 4
    });

    expect(commands).toHaveLength(2);
    expect(commands.every((command) => command.animation === "jumping")).toBe(true);
  });

  it("occasionally creates a chase scene where one pet runs ahead and the other follows", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 300, y: 360, width: 620, height: 520 },
        { slot: 1, x: 650, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 6
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ slot: 0, animation: "runRight" });
    expect(commands[1]).toMatchObject({ slot: 1, animation: "runRight" });
    expect(commands[0].target.x).toBeGreaterThan(300);
    expect(commands[1].target.x).toBeGreaterThan(650);
    expect(commands[1].target.x - commands[0].target.x).toBeGreaterThanOrEqual(110);
  });

  it("keeps a chase scene alive for several play ticks", () => {
    const early = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 300, y: 360, width: 620, height: 520 },
        { slot: 1, x: 650, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 6
    });
    const later = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 430, y: 355, width: 620, height: 520 },
        { slot: 1, x: 790, y: 375, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 11
    });

    expect(early.every((command) => command.animation === "runRight")).toBe(true);
    expect(later.every((command) => command.animation === "runRight")).toBe(true);
  });

  it("uses chase scenes for most of a play cycle", () => {
    const chaseTicks = Array.from({ length: 20 }, (_, tick) => {
      const commands = planPetPlayStep({
        enabled: true,
        movementEnabled: true,
        chatOpen: false,
        bounds: [
          { slot: 0, x: 300, y: 360, width: 620, height: 520 },
          { slot: 1, x: 650, y: 380, width: 620, height: 520 }
        ],
        screen: { width: 1920, height: 1080 },
        petScale: 0.5,
        tick
      });

      return commands.length === 2 && commands[0].animation === commands[1].animation;
    }).filter(Boolean).length;

    expect(chaseTicks).toBeGreaterThanOrEqual(14);
  });

  it("keeps chase movement playful instead of too fast", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 300, y: 360, width: 620, height: 520 },
        { slot: 1, x: 650, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 6
    });

    expect(commands.every((command) => command.durationMs >= 1400)).toBe(true);
    expect(commands[1].target.x - 650).toBeLessThanOrEqual(230);
  });

  it("changes which pet is chased across chase scenes", () => {
    const firstScene = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 500, y: 360, width: 620, height: 520 },
        { slot: 1, x: 820, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 6
    });
    const nextScene = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 500, y: 360, width: 620, height: 520 },
        { slot: 1, x: 820, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 26
    });

    expect(firstScene[1].target.x).toBeGreaterThan(820);
    expect(nextScene[0].target.x).toBeLessThan(500);
  });

  it("turns a chase away from the edge so the runner does not get stuck off-screen", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: 1490, y: 360, width: 620, height: 520 },
        { slot: 1, x: 1660, y: 380, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 6
    });

    expect(commands).toHaveLength(2);
    expect(commands.every((command) => command.animation === "runLeft")).toBe(true);
    expect(commands[1].target.x).toBeLessThan(1660);
    expect(commands[0].target.x).toBeLessThan(1490);
  });

  it("clamps play targets by the visible pet body instead of the transparent window", () => {
    const commands = planPetPlayStep({
      enabled: true,
      movementEnabled: true,
      chatOpen: false,
      bounds: [
        { slot: 0, x: -430, y: 200, width: 620, height: 520 },
        { slot: 1, x: -300, y: 220, width: 620, height: 520 }
      ],
      screen: { width: 1920, height: 1080 },
      petScale: 0.5,
      tick: 4
    });

    expect(commands[0].target.x).toBe(-430);
  });
});
