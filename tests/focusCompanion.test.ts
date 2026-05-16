import { describe, expect, it } from "vitest";
import { formatFocusCompanionDoneBubble, resolveFocusCompanionIntent } from "../src/lib/focusCompanion";

describe("focus companion", () => {
  it("parses focus companion commands with an optional duration", () => {
    expect(resolveFocusCompanionIntent("陪我专注 25 分钟")?.durationMinutes).toBe(25);
    expect(resolveFocusCompanionIntent("监督我整理桌面")?.durationMinutes).toBe(30);
    expect(resolveFocusCompanionIntent("帮我看看 README")).toBeUndefined();
  });

  it("creates a short completion bubble", () => {
    expect(formatFocusCompanionDoneBubble("整理桌面")).toContain("整理桌面");
  });
});
