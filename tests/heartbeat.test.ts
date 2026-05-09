import { describe, expect, it } from "vitest";
import {
  buildHeartbeatPrompt,
  chooseLocalGreeting,
  getDueGreetingSlot,
  shouldCollapseToBubble
} from "../src/lib/heartbeat";

describe("heartbeat greeting schedule", () => {
  it("returns the morning slot around 09:40 only once per day", () => {
    const due = getDueGreetingSlot(new Date("2026-05-08T09:41:00+08:00"), []);
    expect(due?.id).toBe("morning");

    const repeated = getDueGreetingSlot(new Date("2026-05-08T09:42:00+08:00"), [due!.key]);
    expect(repeated).toBeUndefined();
  });

  it("supports lunch and after-work slots", () => {
    expect(getDueGreetingSlot(new Date("2026-05-08T12:05:00+08:00"), [])?.id).toBe("lunch");
    expect(getDueGreetingSlot(new Date("2026-05-08T18:24:00+08:00"), [])?.id).toBe("afterWork");
  });

  it("does not trigger outside the configured windows", () => {
    expect(getDueGreetingSlot(new Date("2026-05-08T10:20:00+08:00"), [])).toBeUndefined();
  });
});

describe("heartbeat greeting content", () => {
  it("picks deterministic local fallback greetings", () => {
    expect(chooseLocalGreeting("morning", 0)).toContain("早上好");
    expect(chooseLocalGreeting("lunch", 1)).toContain("午饭");
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
