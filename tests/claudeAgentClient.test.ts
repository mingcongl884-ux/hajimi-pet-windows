import { describe, expect, it } from "vitest";
import { buildClaudePermissionOptions, toClaudePermissionMode } from "../electron/claudeAgentClient";

describe("Claude Agent SDK permissions", () => {
  it("maps HaJiMi office permissions to Claude Agent SDK modes", () => {
    expect(toClaudePermissionMode("default")).toBe("dontAsk");
    expect(toClaudePermissionMode("auto-review")).toBe("acceptEdits");
    expect(toClaudePermissionMode("full-access")).toBe("bypassPermissions");
  });

  it("keeps default mode read-only and full access explicit", () => {
    expect(buildClaudePermissionOptions({
      workspaceDir: "C:\\work\\project",
      allowCommands: false,
      permissionMode: "default"
    })).toMatchObject({
      tools: ["Read", "Glob", "Grep", "LS"],
      permissionMode: "dontAsk"
    });

    expect(buildClaudePermissionOptions({
      workspaceDir: "C:\\work\\project",
      allowCommands: true,
      permissionMode: "full-access"
    })).toMatchObject({
      tools: { type: "preset", preset: "claude_code" },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true
    });
  });
});
