import { describe, expect, it } from "vitest";
import { canRunRemoteTool } from "../src/lib/remoteBridge";

describe("remote bridge permission policy", () => {
  it("keeps default permission read-only", () => {
    expect(canRunRemoteTool("default", "listFiles")).toEqual({ allowed: true });
    expect(canRunRemoteTool("default", "readFile")).toEqual({ allowed: true });
    expect(canRunRemoteTool("default", "writeFile")).toEqual({ allowed: false, reason: "permission-denied" });
    expect(canRunRemoteTool("default", "runCommand")).toEqual({ allowed: false, reason: "permission-denied" });
  });

  it("requires review for risky auto-review tools", () => {
    expect(canRunRemoteTool("auto-review", "writeFile")).toEqual({ allowed: true });
    expect(canRunRemoteTool("auto-review", "openApplication")).toEqual({ allowed: false, reason: "review-required" });
    expect(canRunRemoteTool("auto-review", "runCommand")).toEqual({ allowed: false, reason: "review-required" });
  });

  it("allows full access to run complete host tools", () => {
    expect(canRunRemoteTool("full-access", "runCommand")).toEqual({ allowed: true });
    expect(canRunRemoteTool("full-access", "openApplication")).toEqual({ allowed: true });
  });
});
