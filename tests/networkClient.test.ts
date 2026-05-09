import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRemoteNotices, markNoticeRead } from "../electron/networkClient";
import { DEFAULT_SETTINGS, GITHUB_NOTICE_FEED_URL, GITHUB_UPDATE_FEED_URL } from "../electron/settingsStore";

const networkClientSource = readFileSync(join(process.cwd(), "electron", "networkClient.ts"), "utf8");

describe("network client", () => {
  it("imports electron-updater through its CommonJS-compatible default export", () => {
    expect(networkClientSource).toContain('import electronUpdater from "electron-updater"');
    expect(networkClientSource).not.toContain('import { autoUpdater } from "electron-updater"');
    expect(networkClientSource).not.toContain("const { autoUpdater } = electronUpdater;\n\nexport type");
  });

  it("uses GitHub as the default public update and notice feed", () => {
    expect(DEFAULT_SETTINGS.network.updateFeedUrl).toBe(GITHUB_UPDATE_FEED_URL);
    expect(DEFAULT_SETTINGS.network.noticeFeedUrl).toBe(GITHUB_NOTICE_FEED_URL);
    expect(GITHUB_UPDATE_FEED_URL).toBe("https://github.com/mingcongl884-ux/hajimi-pet-windows/releases/latest/download");
    expect(GITHUB_NOTICE_FEED_URL).toBe("https://raw.githubusercontent.com/mingcongl884-ux/hajimi-pet-windows/main/notices.json");
  });

  it("reads unread notices from a remote JSON feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        notices: [
          { id: "n1", title: "更新", message: "新版本来了", publishedAt: "2026-05-09T00:00:00.000Z" },
          { id: "read", title: "旧公告", message: "已读" }
        ]
      })
    });

    const result = await checkRemoteNotices({
      autoCheckEnabled: true,
      updateFeedUrl: "",
      noticeFeedUrl: "https://example.com/notices.json",
      readNoticeIds: ["read"]
    }, fetchMock as unknown as typeof fetch);

    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].id).toBe("n1");
  });

  it("marks notices as read without duplicates", () => {
    const settings = markNoticeRead({
      ...DEFAULT_SETTINGS,
      network: {
        ...DEFAULT_SETTINGS.network,
        readNoticeIds: ["n1"]
      }
    }, "n1");

    expect(settings.network.readNoticeIds).toEqual(["n1"]);
  });
});
