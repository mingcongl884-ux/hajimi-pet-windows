import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterSource = readFileSync(join(process.cwd(), "electron", "channelAdapters.ts"), "utf8");
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const preloadCjsSource = readFileSync(join(process.cwd(), "electron", "preload.cjs"), "utf8");
const globalSource = readFileSync(join(process.cwd(), "src", "global.d.ts"), "utf8");

describe("channel adapter source", () => {
  it("has Feishu and WeChat adapter entry points", () => {
    expect(adapterSource).toContain("startChannelAdapter");
    expect(adapterSource).toContain("stopChannelAdapter");
    expect(adapterSource).toContain("testChannelAdapter");
    expect(adapterSource).toContain('provider === "feishu"');
    expect(adapterSource).toContain('provider === "wechat"');
  });

  it("exposes channel IPC to the renderer", () => {
    expect(mainSource).toContain('"pet:start-channel"');
    expect(mainSource).toContain('"pet:stop-channel"');
    expect(mainSource).toContain('"pet:test-channel"');
    expect(preloadSource).toContain("startChannel");
    expect(preloadSource).toContain("stopChannel");
    expect(preloadSource).toContain("testChannel");
    expect(preloadCjsSource).toContain("startChannel");
    expect(globalSource).toContain("startChannel");
    expect(globalSource).toContain("testChannel");
  });
});
