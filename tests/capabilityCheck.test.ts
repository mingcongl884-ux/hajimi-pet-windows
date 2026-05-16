import { describe, expect, it } from "vitest";
import { capabilityStatusLabel, summarizeCapabilities } from "../src/lib/capabilityCheck";

describe("capability check", () => {
  it("summarizes mixed capability rows", () => {
    expect(summarizeCapabilities([
      { id: "model", label: "模型", status: "ready", message: "连接正常" },
      { id: "wechat", label: "微信", status: "warning", message: "未连接" }
    ])).toBe("可用：模型。需配置：微信。");
  });

  it("labels blocked rows clearly", () => {
    expect(capabilityStatusLabel("blocked")).toBe("不可用");
  });
});
