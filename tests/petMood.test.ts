import { describe, expect, it } from "vitest";
import { evolvePetMood, moodToAnimation, pickMoodBubble } from "../src/lib/petMood";

describe("pet mood", () => {
  it("turns user and work events into persistent pet moods", () => {
    expect(evolvePetMood("idle", "praised").mood).toBe("happy");
    expect(evolvePetMood("happy", "focusStarted").mood).toBe("focused");
    expect(evolvePetMood("focused", "workTooLong").mood).toBe("concerned");
    expect(evolvePetMood("concerned", "ignoredTooLong").mood).toBe("lonely");
    expect(evolvePetMood("lonely", "quietRequested").mood).toBe("calm");
  });

  it("maps moods to existing animations and short bubble copy", () => {
    expect(moodToAnimation("happy")).toBe("waving");
    expect(moodToAnimation("focused")).toBe("review");
    expect(moodToAnimation("lonely")).toBe("failed");
    expect(pickMoodBubble("concerned", 0)).toContain("休息");
  });
});
