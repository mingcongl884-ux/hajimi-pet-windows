import { app } from "electron";
import electronUpdater from "electron-updater";
import type { AppSettings, NetworkSettings, RemoteNotice } from "./settingsStore.js";

export type UpdateCheckResult = {
  status: "disabled" | "checking" | "available" | "not-available" | "downloaded" | "error";
  currentVersion: string;
  version?: string;
  message?: string;
};

type NoticeFeed = {
  notices?: RemoteNotice[];
};

export async function checkForAppUpdates(network: NetworkSettings): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  if (!network.updateFeedUrl.trim()) {
    return {
      status: "disabled",
      currentVersion,
      message: "还没有配置更新源。"
    };
  }

  if (!app.isPackaged) {
    return {
      status: "disabled",
      currentVersion,
      message: "开发模式不会执行安装包更新检查。打包安装后会自动启用。"
    };
  }

  try {
    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.setFeedURL({ provider: "generic", url: network.updateFeedUrl.trim().replace(/\/+$/, "") });
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    return version && version !== currentVersion
      ? { status: "available", currentVersion, version, message: `发现新版本 ${version}。` }
      : { status: "not-available", currentVersion, version: currentVersion, message: "已经是最新版本。" };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: error instanceof Error ? error.message : "检查更新失败。"
    };
  }
}

export async function checkRemoteNotices(
  network: NetworkSettings,
  fetchImpl: typeof fetch = fetch
): Promise<{ notices: RemoteNotice[]; checkedAt: string; message?: string }> {
  const checkedAt = new Date().toISOString();
  if (!network.noticeFeedUrl.trim()) {
    return { notices: [], checkedAt, message: "还没有配置公告源。" };
  }

  try {
    const response = await fetchImpl(network.noticeFeedUrl.trim(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      return { notices: [], checkedAt, message: `公告源返回 ${response.status}。` };
    }

    const data = await response.json();
    const notices = readNotices(data)
      .filter((notice) => !network.readNoticeIds.includes(notice.id))
      .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""));
    return { notices, checkedAt };
  } catch (error) {
    return {
      notices: [],
      checkedAt,
      message: error instanceof Error ? error.message : "检查公告失败。"
    };
  }
}

export function markNoticeRead(settings: AppSettings, noticeId: string): AppSettings {
  const readNoticeIds = [...new Set([...(settings.network.readNoticeIds ?? []), noticeId])].slice(-200);
  return {
    ...settings,
    network: {
      ...settings.network,
      readNoticeIds
    }
  };
}

function readNotices(data: unknown): RemoteNotice[] {
  const feedNotices = (data as NoticeFeed | undefined)?.notices;
  const rawNotices: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(feedNotices)
      ? feedNotices
      : [];

  return rawNotices
    .map((notice) => sanitizeNotice(notice))
    .filter((notice): notice is RemoteNotice => Boolean(notice));
}

function sanitizeNotice(notice: unknown): RemoteNotice | undefined {
  if (!notice || typeof notice !== "object") {
    return undefined;
  }

  const typed = notice as Partial<Record<keyof RemoteNotice, unknown>>;
  const id = typeof typed.id === "string" ? typed.id.trim() : "";
  const title = typeof typed.title === "string" ? typed.title.trim() : "";
  const message = typeof typed.message === "string" ? typed.message.trim() : "";
  if (!id || !title || !message) {
    return undefined;
  }

  return {
    id,
    title,
    message,
    url: typeof typed.url === "string" ? typed.url : undefined,
    version: typeof typed.version === "string" ? typed.version : undefined,
    publishedAt: typeof typed.publishedAt === "string" ? typed.publishedAt : undefined
  };
}
