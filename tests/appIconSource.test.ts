import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const afterPackSource = readFileSync(join(process.cwd(), "scripts", "after-pack.cjs"), "utf8");

describe("app icon wiring", () => {
  it("configures the Windows executable icon", () => {
    expect(packageJson.build.win.icon).toBe("assets/icons/app-icon.ico");
    expect(packageJson.build.win.signAndEditExecutable).toBe(false);
    expect(packageJson.build.afterPack).toBe("scripts/after-pack.cjs");
  });

  it("uses the app icon asset for tray and windows instead of the full spritesheet", () => {
    expect(mainSource).toContain("appIconPath()");
    expect(mainSource).toContain("nativeImage.createFromPath(appIconPath())");
    expect(mainSource).not.toContain('nativeImage.createFromPath(join(petsDir(), "xiaomi", "spritesheet.webp"))');
  });

  it("defines an NSIS installer package script", () => {
    expect(packageJson.scripts["package:installer"]).toContain("electron-builder --win nsis");
    expect(packageJson.build.nsis.createDesktopShortcut).toBe(true);
    expect(packageJson.build.nsis.allowToChangeInstallationDirectory).toBe(true);
  });

  it("keeps NSIS unpack scope narrow so the installer does not copy every dependency file", () => {
    expect(packageJson.build.asarUnpack).not.toContain("node_modules/**");
    expect(packageJson.build.asarUnpack).toEqual(expect.arrayContaining([
      "node_modules/node/**",
      "node_modules/openclaw/**",
      "node_modules/@tencent-weixin/openclaw-weixin/**",
      "node_modules/qrcode-terminal/**",
      "node_modules/zod/**"
    ]));
  });

  it("updates the packaged executable icon before installer creation", () => {
    expect(afterPackSource).toContain("--set-icon");
    expect(afterPackSource).toContain("node_modules");
    expect(afterPackSource).toContain("rcedit");
  });
});
