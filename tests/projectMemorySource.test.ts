import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project memory source wiring", () => {
  it("stores project memory outside settings and shows suggestions in office", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const global = readFileSync("src/global.d.ts", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");
    const manager = readFileSync("src/components/ManagerPage.tsx", "utf8");
    const store = readFileSync("electron/projectMemoryStore.ts", "utf8");

    expect(main).toContain("pet:get-project-memory");
    expect(main).toContain("pet:update-project-memory");
    expect(preload).toContain("getProjectMemory");
    expect(global).toContain("getProjectMemory(projectId: string): Promise<ProjectMemory | undefined>");
    expect(app).toContain("updateProjectMemory");
    expect(app).toContain("extractMemoryFilesFromDisplay");
    expect(manager).toContain("projectMemorySuggestion");
    expect(manager).toContain("memory-suggestion");
    expect(store).toContain("project-memory.json");
    expect(store).toContain("backupCorruptFile");
    expect(store).toContain('error.code === "ENOENT"');
  });
});
