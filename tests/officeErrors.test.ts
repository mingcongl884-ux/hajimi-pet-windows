import { describe, expect, it } from "vitest";
import { normalizeOfficeErrorMessage } from "../electron/officeErrors";

describe("office error normalization", () => {
  it("turns OpenClaw template failures into repairable office copy", () => {
    expect(normalizeOfficeErrorMessage(new Error("Missing workspace template: AGENTS.md"))).toContain("OpenClaw 工作区模板缺失");
    expect(normalizeOfficeErrorMessage(new Error("Missing workspace template: AGENTS.md"))).toContain("能力体检");
  });

  it("keeps cancellation quiet and recognizable", () => {
    expect(normalizeOfficeErrorMessage(new Error("OpenClaw task was cancelled."))).toBe("已停止生成。");
  });

  it("classifies permission and remote bridge failures", () => {
    expect(normalizeOfficeErrorMessage(new Error("Path is outside workspace: Desktop/a.xlsx"))).toContain("当前权限不允许");
    expect(normalizeOfficeErrorMessage(new Error("remote bridge ECONNREFUSED"))).toContain("远程电脑连接不可用");
  });
});
