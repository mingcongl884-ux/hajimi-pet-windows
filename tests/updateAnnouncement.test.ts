import { describe, expect, it } from "vitest";
import { formatUpdateAnnouncement } from "../src/lib/updateAnnouncement";

describe("update announcement", () => {
  it("includes release notes in the pet bubble when available", () => {
    expect(formatUpdateAnnouncement({
      version: "0.1.52",
      releaseNotes: "- 情绪系统\n- 任务陪跑\n- 更新详情气泡"
    })).toContain("情绪系统");
  });

  it("falls back to a concise update notice", () => {
    expect(formatUpdateAnnouncement({ version: "0.1.52" })).toContain("系统页");
  });
});
