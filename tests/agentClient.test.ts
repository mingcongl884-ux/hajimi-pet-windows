import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { getCommandPolicy, runAgentTask, resolveWorkspacePath } from "../electron/agentClient";

describe("resolveWorkspacePath", () => {
  it("keeps file access inside the selected workspace", () => {
    const root = "C:\\work\\project";

    expect(resolveWorkspacePath(root, "src/app.ts")).toBe("C:\\work\\project\\src\\app.ts");
    expect(() => resolveWorkspacePath(root, "..\\secrets.txt")).toThrow(/outside workspace/);
  });
});

describe("runAgentTask", () => {
  it("executes model-requested file tools and returns the final answer", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "xiaomi-agent-"));
    await writeFile(join(workspaceDir, "README.md"), "old", "utf8");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call_1",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: JSON.stringify({ path: "README.md", content: "new" })
                }
              }]
            }
          }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { role: "assistant", content: "README.md updated." }
          }]
        })
      });

    const response = await runAgentTask(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "agent-model",
      systemPrompt: "Be helpful."
    }, {
      workspaceDir,
      allowCommands: false,
      permissionMode: "default"
    }, "Update the readme.");

    expect(response.content).toBe("README.md updated.");
    await expect(readFile(join(workspaceDir, "README.md"), "utf8")).resolves.toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps project permission levels to command execution policy", () => {
    expect(getCommandPolicy({
      workspaceDir: "C:\\work\\project",
      allowCommands: true,
      permissionMode: "default"
    })).toEqual({ enabled: false, blockDangerousCommands: true });

    expect(getCommandPolicy({
      workspaceDir: "C:\\work\\project",
      allowCommands: true,
      permissionMode: "auto-review"
    })).toEqual({ enabled: true, blockDangerousCommands: true });

    expect(getCommandPolicy({
      workspaceDir: "C:\\work\\project",
      allowCommands: true,
      permissionMode: "full-access"
    })).toEqual({ enabled: true, blockDangerousCommands: false });
  });
});
