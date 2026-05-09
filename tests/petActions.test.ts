import { describe, expect, it } from "vitest";
import { readPetAction } from "../src/lib/petActions";

describe("pet actions", () => {
  it("accepts known safe pet actions", () => {
    expect(readPetAction({ type: "jump" })).toEqual({ type: "jump" });
    expect(readPetAction({ type: "say", text: "你好" })).toEqual({ type: "say", text: "你好" });
    expect(readPetAction({ type: "moveTo", x: 10, y: 20 })).toEqual({ type: "moveTo", x: 10, y: 20 });
  });

  it("rejects malformed actions", () => {
    expect(readPetAction({ type: "moveTo", x: "left", y: 20 })).toBeUndefined();
    expect(readPetAction({ type: "say", text: "" })).toBeUndefined();
    expect(readPetAction({ type: "deleteEverything" })).toBeUndefined();
  });
});
