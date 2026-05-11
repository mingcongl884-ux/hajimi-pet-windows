import { describe, expect, it } from "vitest";
import { buildClaudeEnvironment, buildClaudePermissionOptions, toClaudePermissionMode } from "../electron/claudeAgentClient";

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

  it("can inherit Claude Code or CC Switch provider settings when API fields are empty", () => {
    const inherited = buildClaudeEnvironment({
      id: "cc-switch",
      name: "CC Switch",
      provider: "claude-agent",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "",
      systemPrompt: ""
    }, { PATH: "C:\\tools" });

    expect(inherited.ANTHROPIC_API_KEY).toBeUndefined();
    expect(inherited.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(inherited.CLAUDE_AGENT_SDK_CLIENT_APP).toBe("hajimi-pet/0.1");

    const explicit = buildClaudeEnvironment({
      id: "direct",
      name: "Direct",
      provider: "claude-agent",
      baseUrl: "https://example.com/anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      systemPrompt: ""
    }, {});

    expect(explicit.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(explicit.ANTHROPIC_BASE_URL).toBe("https://example.com/anthropic");
  });
});
