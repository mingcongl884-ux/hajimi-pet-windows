import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildOpenClawConfig, parseOpenClawAgentOutput, runOpenClawAgentTask } from "../electron/openClawAgentClient";

describe("buildOpenClawConfig", () => {
  it("creates a custom OpenAI-compatible provider without persisting the secret", () => {
    const config = buildOpenClawConfig({
      baseUrl: "https://api.xiaomimimo.com/",
      apiKey: "secret-key",
      model: "mimo-v2.5-pro",
      systemPrompt: "You are HaJiMi."
    }, {
      workspaceDir: "F:\\test",
      allowCommands: true,
      permissionMode: "auto-review"
    });

    const serialized = JSON.stringify(config);
    expect(serialized).toContain("hajimi-default/mimo-v2.5-pro");
    expect(serialized).toContain("https://api.xiaomimimo.com/v1");
    expect(serialized).toContain("HAJIMI_OPENCLAW_API_KEY");
    expect(serialized).not.toContain("secret-key");
    expect("identity" in config).toBe(false);
    expect(config.tools.profile).toBe("coding");
  });

  it("maps full access to OpenClaw full tools and elevated execution", () => {
    const config = buildOpenClawConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "agent-model",
      systemPrompt: "You are HaJiMi."
    }, {
      workspaceDir: "F:\\test",
      allowCommands: true,
      permissionMode: "full-access"
    });

    expect(config.tools.profile).toBe("full");
    expect(config.tools.elevated.enabled).toBe(true);
    expect(config.agents.defaults.sandbox.mode).toBe("off");
  });
});

describe("parseOpenClawAgentOutput", () => {
  it("extracts assistant text from JSON payloads even when stderr noise is present", () => {
    const parsed = parseOpenClawAgentOutput("diagnostic\n{\"payloads\":[{\"type\":\"text\",\"text\":\"处理好了\"}],\"meta\":{\"transport\":\"embedded\"}}\n");

    expect(parsed.content).toBe("处理好了");
  });
});

describe("runOpenClawAgentTask", () => {
  it("runs bundled OpenClaw with isolated config and env key", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "hajimi-openclaw-"));
    const spawnImpl = vi.fn((_command, _args, options) => {
      const listeners = new Map<string, Array<(value: unknown) => void>>();
      const child = {
        stdout: { on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
          if (event === "data") {
            cb(Buffer.from("{\"content\":\"OpenClaw 完成了\"}"));
          }
        }) },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (value?: unknown) => void) => {
          listeners.set(event, [...(listeners.get(event) ?? []), cb]);
          if (event === "close") {
            queueMicrotask(() => cb(0));
          }
        }),
        kill: vi.fn()
      };
      expect(options.env.HAJIMI_OPENCLAW_API_KEY).toBe("secret-key");
      expect(options.env.OPENCLAW_STATE_DIR).toBe(stateDir);
      expect(options.env.OPENCLAW_CONFIG_PATH).toBe(join(stateDir, "openclaw.json"));
      return child;
    });

    const response = await runOpenClawAgentTask({
      baseUrl: "https://api.example.com",
      apiKey: "secret-key",
      model: "agent-model",
      systemPrompt: "You are HaJiMi."
    }, {
      workspaceDir: stateDir,
      allowCommands: true,
      permissionMode: "auto-review"
    }, "整理项目", {
      stateDir,
      nodeRuntime: "node",
      openClawCli: "openclaw.mjs",
      spawnImpl
    });

    expect(response.content).toBe("OpenClaw 完成了");
    expect(spawnImpl).toHaveBeenCalledWith(
      "node",
      ["openclaw.mjs", "agent", "--local", "--json", "--agent", "hajimi", "--session-id", expect.stringMatching(/^hajimi-/), "--message", "整理项目", "--timeout", "600"],
      expect.objectContaining({ windowsHide: true })
    );
    const configText = await readFile(join(stateDir, "openclaw.json"), "utf8");
    expect(configText).toContain("HAJIMI_OPENCLAW_API_KEY");
    expect(configText).not.toContain("secret-key");
  });
});
