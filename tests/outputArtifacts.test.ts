import { describe, expect, it } from "vitest";
import { buildOutputArtifacts, formatOutputArtifactHeader } from "../src/lib/outputArtifacts";

describe("output artifacts", () => {
  it("groups generated files with compact metadata", () => {
    const artifacts = buildOutputArtifacts([
      { path: "C:\\Users\\123\\Desktop\\report.xlsx", name: "report.xlsx", size: 2048 },
      { path: "C:\\Users\\123\\Desktop\\report.xlsx", name: "report.xlsx", size: 2048 },
      { path: "reports/summary.md", name: "summary.md" }
    ]);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatchObject({
      displayName: "report.xlsx",
      extensionLabel: "XLSX",
      sizeLabel: "2.0 KB",
      locationLabel: ".../123/Desktop"
    });
    expect(artifacts[1]).toMatchObject({
      displayName: "summary.md",
      extensionLabel: "MD"
    });
    expect(formatOutputArtifactHeader(2)).toBe("本次生成 2 个文件");
  });

  it("returns no artifacts for empty or pathless output", () => {
    expect(buildOutputArtifacts(undefined)).toEqual([]);
    expect(buildOutputArtifacts([{ path: " ", name: "empty" }])).toEqual([]);
  });
});
