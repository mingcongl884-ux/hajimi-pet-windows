import { describe, expect, it } from "vitest";
import { readPetAction } from "../src/lib/petActions";

describe("pet actions", () => {
  it("accepts known safe pet actions", () => {
    expect(readPetAction({ type: "jump" })).toEqual({ type: "jump" });
    expect(readPetAction({ type: "say", text: "hello" })).toEqual({ type: "say", text: "hello" });
    expect(readPetAction({ type: "moveTo", x: 10, y: 20 })).toEqual({ type: "moveTo", x: 10, y: 20 });
    expect(readPetAction({ type: "moveToEdge", edge: "topRight" })).toEqual({ type: "moveToEdge", edge: "topRight" });
    expect(readPetAction({ type: "setMovement", enabled: true, intensity: "lively" })).toEqual({
      type: "setMovement",
      enabled: true,
      intensity: "lively"
    });
    expect(readPetAction({ type: "setMovement", enabled: false })).toEqual({ type: "setMovement", enabled: false });
    expect(readPetAction({ type: "mood", mood: "waiting" })).toEqual({ type: "mood", mood: "waiting" });
    expect(readPetAction({ type: "mood", mood: "review" })).toEqual({ type: "mood", mood: "review" });
  });

  it("rejects malformed actions", () => {
    expect(readPetAction({ type: "moveTo", x: "left", y: 20 })).toBeUndefined();
    expect(readPetAction({ type: "moveToEdge", edge: "outside" })).toBeUndefined();
    expect(readPetAction({ type: "setMovement", enabled: true, intensity: "wild" })).toBeUndefined();
    expect(readPetAction({ type: "setMovement", enabled: "yes" })).toBeUndefined();
    expect(readPetAction({ type: "mood", mood: "sleepy" })).toBeUndefined();
    expect(readPetAction({ type: "say", text: "" })).toBeUndefined();
    expect(readPetAction({ type: "deleteEverything" })).toBeUndefined();
  });
});
