import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildClaudeEnvironment,
  buildClaudePermissionOptions,
  readClaudeFileOutputs,
  resolveClaudeCodeExecutable,
  toClaudePermissionMode
} from "../electron/claudeAgentClient";

describe("Claude Agent SDK permissions", () => {
  it("maps HaJiMi office permissions to Claude Agent SDK modes", () => {
    expect(toClaudePermissionMode("default")).toBe("dontAsk");
    expect(toClaudePermissionMode("auto-review")).toBe("acceptEdits");
    expect(toClaudePermissionMode("full-access")).toBe("bypassPermissions");
  });

  it("keeps default mode read-only, allows safe Bash in auto-review, and full access explicit", () => {
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
      permissionMode: "auto-review"
    })).toMatchObject({
      tools: { type: "preset", preset: "claude_code" },
      allowedTools: expect.arrayContaining(["Bash", "Read", "Write"]),
      permissionMode: "acceptEdits"
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

  it("gives advanced office mode enough turns for file work", () => {
    const source = readFileSync("electron/claudeAgentClient.ts", "utf8");

    expect(source).toContain("maxTurns: 24");
    expect(source).toContain("use Bash");
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

  it("finds a system Claude Code executable for CC Switch-backed advanced office mode", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hajimi-claude-"));
    const claudePath = join(tempDir, "claude.exe");
    writeFileSync(claudePath, "");

    try {
      expect(resolveClaudeCodeExecutable({
        PATH: tempDir,
        PATHEXT: ".COM;.EXE;.BAT;.CMD"
      })).toBe(claudePath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("prefers an explicit Claude Code executable override", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hajimi-claude-"));
    const claudePath = join(tempDir, "custom-claude.exe");
    writeFileSync(claudePath, "");

    try {
      expect(resolveClaudeCodeExecutable({
        CLAUDE_CODE_EXECUTABLE_PATH: claudePath,
        PATH: ""
      })).toBe(claudePath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("extracts Claude Code output files for compact chat display", () => {
    const messages = [{
      type: "assistant",
      message: {
        content: [{
          type: "tool_use",
          name: "Write",
          input: { file_path: "reports/summary.md", content: "done" }
        }]
      }
    }];

    expect(readClaudeFileOutputs(messages, "C:\\work\\project")).toEqual([{
      path: "reports\\summary.md",
      name: "summary.md",
      size: 4
    }]);
  });
});
