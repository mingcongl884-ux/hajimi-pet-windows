import { describe, expect, it } from "vitest";
import { resolveReminderTarget } from "../src/lib/reminderTarget";

describe("resolveReminderTarget", () => {
  it("keeps reminder movement in the screen coordinate space on offset displays", () => {
    const target = resolveReminderTarget(
      1980,
      260,
      { x: 1920, y: 0, width: 1280, height: 720 },
      { x: 2500, y: 300, width: 620, height: 520 }
    );

    expect(target.x).toBeGreaterThanOrEqual(1920);
    expect(target.x).toBeLessThanOrEqual(2580);
    expect(target.y).toBeGreaterThanOrEqual(0);
    expect(target.y).toBeLessThanOrEqual(200);
  });
});
