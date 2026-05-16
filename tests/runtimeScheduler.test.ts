import { describe, expect, it } from "vitest";
import { createRuntimeSchedule } from "../src/lib/runtimeScheduler";

describe("runtime scheduler", () => {
  it("runs startup tasks immediately and recurring tasks when due", () => {
    const schedule = createRuntimeSchedule([
      { id: "collapse", intervalMs: 1000 },
      { id: "minute", intervalMs: 60_000, runOnStart: true },
      { id: "desktop", intervalMs: 5 * 60 * 1000, runOnStart: true }
    ], 10_000);

    expect(schedule.tick(10_000)).toEqual(["minute", "desktop"]);
    expect(schedule.tick(10_999)).toEqual([]);
    expect(schedule.tick(11_000)).toEqual(["collapse"]);
    expect(schedule.tick(70_000)).toEqual(["collapse", "minute"]);
    expect(schedule.tick(130_000)).toEqual(["collapse", "minute"]);
    expect(schedule.tick(190_000)).toEqual(["collapse", "minute"]);
    expect(schedule.tick(250_000)).toEqual(["collapse", "minute"]);
    expect(schedule.tick(310_000)).toEqual(["collapse", "minute", "desktop"]);
  });

  it("runs enabled startup tasks once and then waits for their interval", () => {
    const schedule = createRuntimeSchedule([
      { id: "network", intervalMs: 6 * 60 * 60 * 1000, runOnStart: true, enabled: false }
    ], 0);

    expect(schedule.tick(0)).toEqual([]);

    schedule.setEnabled("network", true, 5000);

    expect(schedule.tick(5000)).toEqual(["network"]);
    expect(schedule.tick(5000 + 6 * 60 * 60 * 1000 - 1)).toEqual([]);
    expect(schedule.tick(5000 + 6 * 60 * 60 * 1000)).toEqual(["network"]);

    schedule.setEnabled("network", false, 5000 + 6 * 60 * 60 * 1000);
    schedule.setEnabled("network", true, 9000 + 6 * 60 * 60 * 1000);

    expect(schedule.tick(9000 + 6 * 60 * 60 * 1000)).toEqual(["network"]);
  });
});
