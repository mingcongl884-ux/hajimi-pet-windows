import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildProcessListCommand,
  buildSystemStatusCommand,
  createSpreadsheetFile,
  inspectDocumentFile,
  splitSpreadsheetFile
} from "../electron/officeTools";

describe("office tool layer", () => {
  it("creates and inspects xlsx files without dumping binary content", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "hajimi-office-"));

    const result = await createSpreadsheetFile({
      workspaceDir,
      allowCommands: false,
      permissionMode: "default"
    }, {
      path: "reports/scores.xlsx",
      headers: ["name", "score"],
      rows: [["哈基Mi", "100"], ["小助手", "98"]]
    });

    expect(result.fileOutputs).toEqual([{ path: "reports/scores.xlsx", name: "scores.xlsx", size: expect.any(Number) }]);

    const inspection = await inspectDocumentFile(workspaceDir, "reports/scores.xlsx");
    expect(inspection.content).toContain("Excel workbook: reports/scores.xlsx");
    expect(inspection.content).toContain("Sheet: Sheet1");
    expect(inspection.content).toContain("哈基Mi | 100");
    expect(inspection.content).not.toContain("PK");
  });

  it("splits spreadsheet-like CSV files into multiple output files", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "hajimi-office-"));
    await writeFile(join(workspaceDir, "data.csv"), "name,score\nA,1\nB,2\nC,3\nD,4\n", "utf8");

    const result = await splitSpreadsheetFile({
      workspaceDir,
      allowCommands: true,
      permissionMode: "auto-review"
    }, {
      path: "data.csv",
      parts: 2,
      outputDir: "split"
    });

    expect(result.fileOutputs).toHaveLength(2);
    expect(result.content).toContain("Created 2 split files");
    await expect(readFile(join(workspaceDir, "split", "data-part-1.csv"), "utf8")).resolves.toContain("A,1");
    await expect(readFile(join(workspaceDir, "split", "data-part-2.csv"), "utf8")).resolves.toContain("C,3");
  });

  it("builds focused Windows maintenance commands instead of free-form shell", () => {
    expect(buildSystemStatusCommand()).toContain("Get-CimInstance");
    expect(buildSystemStatusCommand()).toContain("Get-PSDrive");
    expect(buildProcessListCommand(8)).toContain("Get-Process");
    expect(buildProcessListCommand(8)).toContain("-First 8");
  });
});
