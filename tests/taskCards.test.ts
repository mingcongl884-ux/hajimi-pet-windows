import { describe, expect, it } from "vitest";
import { buildTaskPlan, createTaskCard, formatTaskElapsed, formatTaskStatus, shouldShowTaskCard, updateTaskPhase } from "../src/lib/taskCards";

describe("task cards", () => {
  it("builds a compact plan from a file task", () => {
    expect(buildTaskPlan("拆分 template_update.xlsx 并保存到桌面")).toEqual([
      "读取相关文件和当前项目",
      "处理表格数据",
      "保存输出文件",
      "回报结果和路径"
    ]);
  });

  it("formats status and elapsed labels", () => {
    expect(formatTaskStatus("processing")).toBe("处理中");
    expect(formatTaskElapsed(65_000)).toBe("1m 5s");
  });

  it("keeps terminal phases with a finish time", () => {
    const task = createTaskCard("检查 README", 1000);
    expect(updateTaskPhase(task, "completed", 3000)).toMatchObject({
      phase: "completed",
      finishedAt: 3000
    });
  });
  it("only shows task cards for actionable office work", () => {
    expect(shouldShowTaskCard("你好")).toBe(false);
    expect(shouldShowTaskCard("hello")).toBe(false);
    expect(shouldShowTaskCard("你是谁")).toBe(false);
    expect(shouldShowTaskCard("到屏幕中间来")).toBe(false);
    expect(shouldShowTaskCard("拆分 template_update.xlsx 并保存到桌面")).toBe(true);
    expect(shouldShowTaskCard("检查一下电脑内存占用")).toBe(true);
    expect(shouldShowTaskCard("帮我修改 README")).toBe(true);
    expect(shouldShowTaskCard("分析这个表格", true)).toBe(true);
  });
});
