import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/settingsStore";
import { defaultChannelSettings, findAllowedPeer } from "../src/lib/channels";

describe("channel settings", () => {
  it("enables first-phase Feishu and WeChat settings by default but keeps them disabled", () => {
    expect(DEFAULT_SETTINGS.channels.map((channel) => channel.provider)).toEqual(["feishu", "wechat"]);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.enabled === false)).toBe(true);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.accessMode === "pairing")).toBe(true);
    expect(DEFAULT_SETTINGS.channels.every((channel) => channel.routeMode === "chat")).toBe(true);
  });

  it("finds allowed peers by channel, kind, and id", () => {
    const channels = defaultChannelSettings().map((channel) => channel.provider === "feishu"
      ? {
        ...channel,
        allowedPeers: [{ id: "ou_1", channel: "feishu" as const, kind: "direct" as const, name: "User" }]
      }
      : channel);

    expect(findAllowedPeer(channels, "feishu", "direct", "ou_1")?.name).toBe("User");
    expect(findAllowedPeer(channels, "wechat", "direct", "ou_1")).toBeUndefined();
  });
});
