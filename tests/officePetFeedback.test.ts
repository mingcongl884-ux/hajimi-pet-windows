import { describe, expect, it } from "vitest";
import { buildOfficePetFeedbackActions } from "../src/lib/officePetFeedback";

describe("office pet feedback", () => {
  it("maps task lifecycle into lightweight pet actions", () => {
    expect(buildOfficePetFeedbackActions("started")).toEqual([{ type: "mood", mood: "review" }]);
    expect(buildOfficePetFeedbackActions("failed")).toEqual([
      { type: "mood", mood: "failed" },
      { type: "say", text: "这次卡住了，我把原因放在会话里。" }
    ]);
    expect(buildOfficePetFeedbackActions("cancelled")).toEqual([
      { type: "mood", mood: "idle" },
      { type: "say", text: "已停止，我先安静一下。" }
    ]);
  });

  it("uses output and remote context in completion copy", () => {
    expect(buildOfficePetFeedbackActions("completed", {
      fileOutputs: [
        { path: "a.xlsx", name: "a.xlsx" },
        { path: "b.xlsx", name: "b.xlsx" }
      ]
    })).toContainEqual({ type: "say", text: "文件整理好了，共 2 个结果。" });
    expect(buildOfficePetFeedbackActions("completed", { remoteTarget: true })).toContainEqual({
      type: "say",
      text: "那台电脑上的任务处理好了。"
    });
  });

  it("rate-limit callers can use deterministic long-running copy", () => {
    expect(buildOfficePetFeedbackActions("long-running", {}, 1)).toEqual([
      { type: "mood", mood: "waiting" },
      { type: "say", text: "还在跑任务，我盯着呢。" }
    ]);
  });
});
