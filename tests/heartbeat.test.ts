import { describe, expect, it } from "vitest";
import {
  buildHeartbeatPrompt,
  chooseLocalGreeting,
  getDueGreetingSlot,
  shouldCollapseToBubble
} from "../src/lib/heartbeat";

describe("heartbeat greeting schedule", () => {
  it("returns the morning slot around 09:40 only once per day", () => {
    const due = getDueGreetingSlot(localDate(2026, 5, 8, 9, 41), []);
    expect(due?.id).toBe("morning");

    const repeated = getDueGreetingSlot(localDate(2026, 5, 8, 9, 42), [due!.key]);
    expect(repeated).toBeUndefined();
  });

  it("supports lunch and after-work slots", () => {
    expect(getDueGreetingSlot(localDate(2026, 5, 8, 12, 5), [])?.id).toBe("lunch");
    expect(getDueGreetingSlot(localDate(2026, 5, 8, 18, 24), [])?.id).toBe("afterWork");
  });

  it("does not trigger outside the configured windows", () => {
    expect(getDueGreetingSlot(localDate(2026, 5, 8, 10, 20), [])).toBeUndefined();
  });
});

describe("heartbeat greeting content", () => {
  it("picks deterministic local fallback greetings", () => {
    expect(chooseLocalGreeting("morning", 0)).toContain("早上好");
    expect(chooseLocalGreeting("lunch", 1)).toContain("中午");
    expect(chooseLocalGreeting("afterWork", 2)).toContain("下班");
  });

  it("builds a short model prompt for proactive greetings", () => {
    expect(buildHeartbeatPrompt("morning")).toContain("HEARTBEAT_OK");
    expect(buildHeartbeatPrompt("afterWork")).toContain("18:20");
  });
});

describe("bubble collapse behavior", () => {
  it("collapses busy conversations after the idle threshold", () => {
    expect(shouldCollapseToBubble({
      busy: true,
      chatOpen: true,
      bubbleOpen: false,
      idleMs: 16000,
      thresholdMs: 15000
    })).toBe(true);
  });

  it("does not collapse when not busy or already bubbled", () => {
    expect(shouldCollapseToBubble({
      busy: false,
      chatOpen: true,
      bubbleOpen: false,
      idleMs: 20000,
      thresholdMs: 15000
    })).toBe(false);
    expect(shouldCollapseToBubble({
      busy: true,
      chatOpen: true,
      bubbleOpen: true,
      idleMs: 20000,
      thresholdMs: 15000
    })).toBe(false);
  });
});

function localDate(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
