import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectMemoryStore } from "../electron/projectMemoryStore";

describe("project memory store", () => {
  it("backs up corrupt memory before replacing it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hajimi-memory-"));
    const store = new ProjectMemoryStore(dir);
    await writeFile(join(dir, "project-memory.json"), "{broken", "utf8");

    await expect(store.updateMemory({
      projectId: "p1",
      task: "split spreadsheet",
      at: "2026-05-17T00:00:00.000Z"
    })).resolves.toMatchObject({ projectId: "p1" });

    await expect(readFile(join(dir, "project-memory.json"), "utf8")).resolves.toContain("split spreadsheet");
    await expect(readdir(dir)).resolves.toEqual(expect.arrayContaining([
      expect.stringMatching(/^project-memory\.json\.corrupt-/)
    ]));
  });
});
