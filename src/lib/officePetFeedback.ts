import type { ChatFileOutput } from "../../electron/chatClient.js";
import type { PetAction } from "./petActions.js";

export type OfficePetFeedbackEvent = "started" | "long-running" | "completed" | "failed" | "cancelled";

export type OfficePetFeedbackOptions = {
  fileOutputs?: readonly ChatFileOutput[];
  remoteTarget?: boolean;
};

const LONG_RUNNING_BUBBLES = [
  "我还在处理，先别急。",
  "还在跑任务，我盯着呢。",
  "这个任务稍微久一点，我继续看着。"
];

export function buildOfficePetFeedbackActions(
  event: OfficePetFeedbackEvent,
  options: OfficePetFeedbackOptions = {},
  seed = Date.now()
): PetAction[] {
  if (event === "started") {
    return [{ type: "mood", mood: "review" }];
  }
  if (event === "long-running") {
    return [
      { type: "mood", mood: "waiting" },
      { type: "say", text: pick(LONG_RUNNING_BUBBLES, seed) }
    ];
  }
  if (event === "completed") {
    return [
      { type: "mood", mood: "happy" },
      { type: "say", text: completedBubble(options) }
    ];
  }
  if (event === "failed") {
    return [
      { type: "mood", mood: "failed" },
      { type: "say", text: "这次卡住了，我把原因放在会话里。" }
    ];
  }
  return [
    { type: "mood", mood: "idle" },
    { type: "say", text: "已停止，我先安静一下。" }
  ];
}

function completedBubble(options: OfficePetFeedbackOptions): string {
  if (options.remoteTarget) {
    return "那台电脑上的任务处理好了。";
  }
  const count = options.fileOutputs?.length ?? 0;
  if (count > 1) {
    return `文件整理好了，共 ${count} 个结果。`;
  }
  if (count === 1) {
    return "文件整理好了，结果放在会话里。";
  }
  return "处理好了，结果放在会话里。";
}

function pick(values: readonly string[], seed: number): string {
  return values[Math.abs(Math.floor(seed)) % values.length] ?? values[0] ?? "";
}
