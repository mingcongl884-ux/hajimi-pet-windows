import { describe, expect, it } from "vitest";
import { toggleActivePetId } from "../src/lib/activePets";

describe("active pets", () => {
  it("adds a second pet when fewer than two are active", () => {
    expect(toggleActivePetId(["xiaomi"], "mimi")).toEqual(["xiaomi", "mimi"]);
  });

  it("removes an active pet but keeps at least one", () => {
    expect(toggleActivePetId(["xiaomi", "mimi"], "mimi")).toEqual(["xiaomi"]);
    expect(toggleActivePetId(["xiaomi"], "xiaomi")).toEqual(["xiaomi"]);
  });

  it("replaces the oldest pet when enabling a third one", () => {
    expect(toggleActivePetId(["xiaomi", "mimi"], "nana")).toEqual(["mimi", "nana"]);
  });
});
