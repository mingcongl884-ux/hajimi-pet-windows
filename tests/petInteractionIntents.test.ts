import { describe, expect, it } from "vitest";
import { resolvePetInteractionIntent } from "../src/lib/petInteractionIntents";

describe("pet interaction intents", () => {
  it("turns playful commands into local movement actions", () => {
    const intent = resolvePetInteractionIntent("你可以直接去玩耍了");

    expect(intent?.reply).toContain("自己去玩");
    expect(intent?.actions).toEqual([
      { type: "setMovement", enabled: true, intensity: "normal" },
      { type: "mood", mood: "happy" }
    ]);
  });

  it("turns quiet commands into local stop actions", () => {
    const intent = resolvePetInteractionIntent("安静会，别跑了");

    expect(intent?.reply).toContain("安静");
    expect(intent?.actions).toEqual([
      { type: "stopMovement" },
      { type: "mood", mood: "idle" }
    ]);
  });

  it("does not intercept normal office requests", () => {
    expect(resolvePetInteractionIntent("先看 README，然后帮我改一下说明")).toBeUndefined();
  });
});
