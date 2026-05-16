import { describe, expect, it } from "vitest";
import {
  cancelOfficeTask,
  completeOfficeTask,
  createOfficeTaskState,
  failOfficeTask,
  retryOfficeTask,
  startOfficeTask
} from "../src/lib/officeTaskState";

describe("office task state", () => {
  it("starts processing and creates a task card for actionable work", () => {
    const state = startOfficeTask(createOfficeTaskState({ lastFailedMessage: "old failure" }), {
      input: "拆分 template_update.xlsx 并保存到桌面",
      now: 1000
    });

    expect(state.status).toBe("processing");
    expect(state.lastFailedMessage).toBeUndefined();
    expect(state.activeTaskInput).toBe("拆分 template_update.xlsx 并保存到桌面");
    expect(state.activeTaskCard).toMatchObject({
      phase: "processing",
      startedAt: 1000
    });
  });

  it("does not create a task card for casual input", () => {
    const state = startOfficeTask(createOfficeTaskState(), { input: "你好", now: 1000 });

    expect(state.status).toBe("processing");
    expect(state.activeTaskCard).toBeUndefined();
  });

  it("forces a task card when an attachment is present", () => {
    const state = startOfficeTask(createOfficeTaskState(), { input: "你好", hasAttachment: true, now: 1000 });

    expect(state.activeTaskCard).toMatchObject({
      phase: "processing",
      startedAt: 1000
    });
  });

  it("marks a task complete with a finished task card", () => {
    const started = startOfficeTask(createOfficeTaskState(), {
      input: "帮我修改 README",
      now: 1000
    });

    expect(completeOfficeTask(started, 3000)).toMatchObject({
      status: "completed",
      activeTaskCard: {
        phase: "completed",
        finishedAt: 3000
      }
    });
  });

  it("marks a task failed and preserves the retry message and card error", () => {
    const started = startOfficeTask(createOfficeTaskState(), {
      input: "帮我修改 README",
      now: 1000
    });

    expect(failOfficeTask(started, "boom", 3000)).toMatchObject({
      status: "failed",
      lastFailedMessage: "帮我修改 README",
      activeTaskCard: {
        phase: "failed",
        finishedAt: 3000,
        error: "boom"
      }
    });
  });

  it("marks a task cancelled with a finished task card", () => {
    const started = startOfficeTask(createOfficeTaskState(), {
      input: "帮我修改 README",
      now: 1000
    });

    expect(cancelOfficeTask(started, 3000)).toMatchObject({
      status: "cancelled",
      activeTaskCard: {
        phase: "cancelled",
        finishedAt: 3000
      }
    });
  });

  it("retries the last failed message as a fresh processing task", () => {
    const failed = failOfficeTask(
      startOfficeTask(createOfficeTaskState(), { input: "帮我修改 README", now: 1000 }),
      "boom",
      3000
    );

    const retried = retryOfficeTask(failed, { now: 5000 });

    expect(retried).toMatchObject({
      status: "processing",
      lastFailedMessage: undefined,
      activeTaskCard: {
        phase: "processing",
        startedAt: 5000,
        error: undefined,
        finishedAt: undefined
      }
    });
  });
});
