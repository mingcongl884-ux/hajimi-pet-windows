import { describe, expect, it } from "vitest";
import { planPetPlayStep } from "../src/lib/petPlay";

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
});
