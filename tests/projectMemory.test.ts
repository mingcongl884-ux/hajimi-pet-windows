import { describe, expect, it } from "vitest";
import { buildProjectMemorySuggestion, extractMemoryFilesFromDisplay, updateProjectMemory } from "../src/lib/projectMemory";

describe("project memory", () => {
  it("stores recent task and output files without raw content", () => {
    const memory = updateProjectMemory(undefined, {
      projectId: "p1",
      task: "拆分表格",
      files: [{ path: "Desktop/a.xlsx", name: "a.xlsx", size: 10 }],
      at: "2026-05-17T00:00:00.000Z"
    });

    expect(memory.recentTasks[0].title).toBe("拆分表格");
    expect(memory.recentFiles[0].name).toBe("a.xlsx");
    expect(memory.preferences.spreadsheetFormat).toBe("xlsx");
    expect(buildProjectMemorySuggestion(memory)?.prompt).toContain("拆分表格");
  });

  it("extracts attachment names from visible messages only", () => {
    expect(extractMemoryFilesFromDisplay("处理一下\n附件：template.xlsx (10 KB)")).toEqual([
      { path: "template.xlsx", name: "template.xlsx" }
    ]);
  });
});
