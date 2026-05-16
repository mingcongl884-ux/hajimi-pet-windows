import { describe, expect, it } from "vitest";
import { choosePetGreeting, PET_GREETINGS, type PetGreetingKind } from "../src/lib/petGreetings";

const REQUIRED_KINDS: PetGreetingKind[] = [
  "morning",
  "lunch",
  "afterWork",
  "lunchNudge",
  "afterHoursNudge",
  "lonely",
  "quiet"
];

describe("pet greetings", () => {
  it("configures every proactive and interaction greeting group", () => {
    for (const kind of REQUIRED_KINDS) {
      expect(PET_GREETINGS[kind].length).toBeGreaterThanOrEqual(5);
      expect(choosePetGreeting(kind, 0).length).toBeGreaterThan(0);
    }
  });

  it("randomizes by seed within each group", () => {
    expect(choosePetGreeting("morning", 0)).not.toBe(choosePetGreeting("morning", 1));
    expect(choosePetGreeting("afterHoursNudge", 9)).toContain("工作");
  });
});
