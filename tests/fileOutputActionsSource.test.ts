import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("file output actions", () => {
  it("wires open, reveal, and copy file actions", () => {
    const main = readFileSync("electron/main.ts", "utf8");
    const preload = readFileSync("electron/preload.ts", "utf8");
    const preloadCjs = readFileSync("electron/preload.cjs", "utf8");
    const global = readFileSync("src/global.d.ts", "utf8");
    const manager = readFileSync("src/components/ManagerPage.tsx", "utf8");

    expect(main).toContain("pet:open-output-file");
    expect(main).toContain("pet:show-output-file");
    expect(main).toContain("shell.openPath");
    expect(main).toContain("isPathInsideRoot");
    expect(main).toContain("Output file path is outside the current workspace or desktop.");
    expect(preload).toContain("openOutputFile");
    expect(preloadCjs).toContain("openOutputFile");
    expect(global).toContain("openOutputFile(path: string): Promise<void>");
    expect(manager).toContain("打开文件");
    expect(manager).toContain("打开所在文件夹");
    expect(manager).toContain("复制路径");
  });
});
