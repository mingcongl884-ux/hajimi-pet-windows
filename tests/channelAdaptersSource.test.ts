import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterSource = readFileSync(join(process.cwd(), "electron", "channelAdapters.ts"), "utf8");
const weixinBridgeSource = readFileSync(join(process.cwd(), "electron", "weixinMessageBridge.ts"), "utf8");
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
    expect(adapterSource).toContain("@tencent-weixin/openclaw-weixin/package.json");
    expect(adapterSource).toContain("qrcode-terminal/package.json");
    expect(adapterSource).toContain("zod/package.json");
    expect(adapterSource).toContain("plugins registry --refresh");
    expect(adapterSource).toContain("plugins enable openclaw-weixin");
    expect(adapterSource).toContain("weixinDirectLoginScript");
    expect(adapterSource).toContain("startWeixinLoginWithQr");
    expect(adapterSource).toContain("waitForWeixinLogin");
    expect(adapterSource).toContain("displayQRCode");
    expect(adapterSource).toContain('"cmd.exe"');
    expect(adapterSource).toContain('"-File"');
    expect(adapterSource).toContain("writePowerShellLaunchScript");
    expect(adapterSource).toContain("hajimi-weixin-setup.ps1");
    expect(adapterSource).toContain("openclaw/openclaw.mjs");
    expect(adapterSource).toContain("node/package.json");
    expect(adapterSource).toContain("node/bin/node");
    expect(adapterSource).toContain(".asar.unpacked");
    expect(adapterSource).toContain("process.resourcesPath");
    expect(adapterSource).toContain("resolveBundledNodeModulesRoots");
    expect(adapterSource).toContain("resolveBundledPackageRootFromNodeModules");
    expect(adapterSource).toContain("findFirstExistingPath");
    expect(adapterSource).toContain("openclaw-runtime");
    expect(adapterSource).toContain("OPENCLAW_STATE_DIR");
    expect(adapterSource).toContain("usedBundled");
    expect(adapterSource).toContain("没有检测到内置或系统 OpenClaw");
    expect(adapterSource).toContain('"channels", "status", "--probe"');
    expect(adapterSource).toContain("launchVisiblePowerShell");
    expect(weixinBridgeSource).toContain("hajimi-weixin-bridge-worker.mjs");
    expect(weixinBridgeSource).toContain("HAJIMI_WEIXIN_PLUGIN_ROOT");
    expect(weixinBridgeSource).toContain("spawn(resolveNodeRuntime()");
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
