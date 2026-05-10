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
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tool_choice).toBe("required");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tool_choice).toBe("auto");
  });

  it("does not duplicate v1 in OpenAI-compatible agent requests", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "xiaomi-agent-"));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "done" } }]
      })
    });

    await runAgentTask(fetchMock, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      model: "agent-model",
      systemPrompt: "Be helpful."
    }, {
      workspaceDir,
      allowCommands: false,
      permissionMode: "default"
    }, "Say done.");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/chat/completions", expect.anything());
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

  it("lets office agent calls control the desktop pet", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "xiaomi-agent-"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "pet_1",
                type: "function",
                function: {
                  name: "control_pet",
                  arguments: JSON.stringify({ type: "moveToEdge", edge: "topRight" })
                }
              }]
            }
          }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "Moving to the top right." } }]
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
    }, "Move to the top right of the screen.");

    expect(response.content).toBe("Moving to the top right.");
    expect(response.petActions).toEqual([{ type: "moveToEdge", edge: "topRight" }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools.some((tool: { function: { name: string } }) =>
      tool.function.name === "control_pet"
    )).toBe(true);
    expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body).tools)).toContain("setMovement");
    expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body).tools)).toContain("review");
    expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body).tools)).toContain("waiting");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain("visible desktop pet body");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain("review work");
  });
});
