import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  buildOpenApplicationCommand,
  getCommandPolicy,
  resolveWritablePath,
  runAgentTask,
  resolveWorkspacePath
} from "../electron/agentClient";

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
    expect(response.fileOutputs).toEqual([{ path: "README.md", name: "README.md", size: 3 }]);
    await expect(readFile(join(workspaceDir, "README.md"), "utf8")).resolves.toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tool_choice).toBe("auto");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tool_choice).toBe("auto");
  });

  it("exposes practical office tools for apps and desktop outputs", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "xiaomi-agent-"));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "done" } }]
      })
    });

    await runAgentTask(fetchMock, {
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "agent-model",
      systemPrompt: "Be helpful."
    }, {
      workspaceDir,
      allowCommands: true,
      permissionMode: "auto-review"
    }, "Open WeChat.");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body.tools)).toContain("open_application");
    expect(JSON.stringify(body.tools)).toContain("inspect_document");
    expect(JSON.stringify(body.tools)).toContain("create_spreadsheet");
    expect(JSON.stringify(body.tools)).toContain("split_spreadsheet");
    expect(JSON.stringify(body.tools)).toContain("get_system_status");
    expect(JSON.stringify(body.tools)).toContain("list_processes");
    expect(JSON.stringify(body.tools)).toContain("batch_files");
    expect(body.messages[0].content).toContain("use tools");
    expect(body.messages[0].content).toContain("Desktop");
  });

  it("runs office file tools and returns created files to the chat", async () => {
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
                id: "office_1",
                type: "function",
                function: {
                  name: "create_spreadsheet",
                  arguments: JSON.stringify({
                    path: "reports/scores.xlsx",
                    headers: ["name", "score"],
                    rows: [["哈基Mi", "100"]]
                  })
                }
              }]
            }
          }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "表格已经生成。" } }]
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
    }, "做一张成绩表。");

    expect(response.content).toBe("表格已经生成。");
    expect(response.fileOutputs).toEqual([{ path: "reports/scores.xlsx", name: "scores.xlsx", size: expect.any(Number) }]);
    await expect(readFile(join(workspaceDir, "reports", "scores.xlsx"))).resolves.toBeInstanceOf(Buffer);
  });

  it("builds safe application launch commands for WeChat", () => {
    const command = buildOpenApplicationCommand("微信");

    expect(command).toContain("WeChat.exe");
    expect(command).toContain("Start-Process");
    expect(command).not.toContain("Remove-Item");
  });

  it("allows non-destructive desktop output paths outside the workspace in elevated modes", () => {
    const workspaceDir = "C:\\work\\project";
    const homeDir = "C:\\Users\\tester";

    expect(resolveWritablePath({
      workspaceDir,
      allowCommands: true,
      permissionMode: "auto-review"
    }, "Desktop\\split-1.csv", homeDir)).toBe("C:\\Users\\tester\\Desktop\\split-1.csv");

    expect(() => resolveWritablePath({
      workspaceDir,
      allowCommands: false,
      permissionMode: "default"
    }, "Desktop\\split-1.csv", homeDir)).toThrow(/outside workspace/);
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
