import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync(join(process.cwd(), "src", "components", "ManagerPage.tsx"), "utf8");
const sidebarSource = readFileSync(join(process.cwd(), "src", "components", "ManagerSidebar.tsx"), "utf8");
const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

describe("channel manager page", () => {
  it("adds a channel page with Feishu and WeChat controls", () => {
    expect(sidebarSource).toContain('type ManagerSection = "office" | "pets" | "models" | "channels" | "system"');
    expect(sidebarSource).toContain('label: "通道"');
    expect(managerSource).toContain("飞书机器人");
    expect(managerSource).toContain("微信插件");
    expect(managerSource).toContain("App ID");
    expect(managerSource).toContain("App Secret");
    expect(managerSource).toContain("桥接地址");
    expect(managerSource).toContain("安装/扫码");
    expect(managerSource).toContain("openClawSetupSteps");
    expect(managerSource).toContain("测试通道");
  });

  it("wires channel actions from the app shell", () => {
    expect(appSource).toContain("onStartChannel={(provider) => window.petApp.startChannel(provider)}");
    expect(appSource).toContain("onStopChannel={(provider) => window.petApp.stopChannel(provider)}");
    expect(appSource).toContain("onTestChannel={(provider) => window.petApp.testChannel(provider)}");
  });
});
