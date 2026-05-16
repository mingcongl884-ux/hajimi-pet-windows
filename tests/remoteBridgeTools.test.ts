import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeRemoteBridgeTool } from "../electron/remoteBridgeTools";

describe("remote bridge tools", () => {
  it("runs read-only host tools without a model", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-tools-"));
    await writeFile(join(workspace, "README.md"), "hello remote", "utf8");

    const result = await executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "default",
      tool: "readFile",
      args: { path: "README.md" }
    });

    expect(result.content).toContain("hello remote");
  });

  it("blocks default writes and allows full access writes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-tools-"));

    await expect(executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "default",
      tool: "writeFile",
      args: { path: "a.txt", content: "blocked" }
    })).rejects.toThrow(/permission/i);

    await executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "full-access",
      tool: "writeFile",
      args: { path: "a.txt", content: "allowed" }
    });

    expect(await readFile(join(workspace, "a.txt"), "utf8")).toBe("allowed");
  });
});
