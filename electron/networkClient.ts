import { app } from "electron";
import electronUpdater from "electron-updater";
import type { AppSettings, NetworkSettings, RemoteNotice } from "./settingsStore.js";

export type UpdateCheckResult = {
  status: "disabled" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "installing" | "error";
  currentVersion: string;
  version?: string;
  message?: string;
  releaseNotes?: string;
};

type NoticeFeed = {
  notices?: RemoteNotice[];
};

type GitHubRelease = {
  body?: string;
};

export async function checkForAppUpdates(
  network: NetworkSettings,
  fetchImpl: typeof fetch = fetch
): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const unavailable = readUpdateUnavailable(network, currentVersion);
  if (unavailable) {
    return unavailable;
  }

  try {
    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.setFeedURL({ provider: "generic", url: network.updateFeedUrl.trim().replace(/\/+$/, "") });
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    const releaseNotes =
      readReleaseNotes((result?.updateInfo as { releaseNotes?: unknown } | undefined)?.releaseNotes) ??
      (version && version !== currentVersion
        ? await fetchReleaseNotesFromFeedUrl(network.updateFeedUrl, fetchImpl).catch(() => undefined)
        : undefined);

    return version && version !== currentVersion
      ? { status: "available", currentVersion, version, releaseNotes, message: `发现新版本 ${version}。` }
      : { status: "not-available", currentVersion, version: currentVersion, message: "已经是最新版本。" };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: error instanceof Error ? error.message : "检查更新失败。"
    };
  }
}

export async function downloadAppUpdate(network: NetworkSettings): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const unavailable = readUpdateUnavailable(network, currentVersion);
  if (unavailable) {
    return unavailable;
  }

  try {
    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.setFeedURL({ provider: "generic", url: network.updateFeedUrl.trim().replace(/\/+$/, "") });
    await autoUpdater.downloadUpdate();
    return {
      status: "downloaded",
      currentVersion,
      message: "更新已下载，点击重启安装即可完成更新。"
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: error instanceof Error ? error.message : "下载更新失败。"
    };
  }
}

export function installDownloadedUpdate(): UpdateCheckResult {
  const currentVersion = app.getVersion();
  try {
    const { autoUpdater } = electronUpdater;
    autoUpdater.quitAndInstall(false, true);
    return {
      status: "installing",
      currentVersion,
      message: "正在重启并安装更新。"
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: error instanceof Error ? error.message : "安装更新失败。"
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

export function readReleaseNotes(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const notes = value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "note" in item) {
        const note = (item as { note?: unknown }).note;
        return typeof note === "string" ? note : "";
      }
      return "";
    })
    .map((note) => note.trim())
    .filter(Boolean);

  return notes.length ? notes.join("\n") : undefined;
}

export async function fetchReleaseNotesFromFeedUrl(
  feedUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | undefined> {
  const apiUrl = resolveGitHubLatestReleaseApiUrl(feedUrl);
  if (!apiUrl) {
    return undefined;
  }

  const response = await fetchImpl(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) {
    return undefined;
  }

  const release = (await response.json()) as GitHubRelease;
  return typeof release.body === "string" ? release.body.trim() || undefined : undefined;
}

export function resolveGitHubLatestReleaseApiUrl(feedUrl: string): string | undefined {
  try {
    const url = new URL(feedUrl.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const releasesIndex = parts.indexOf("releases");
    if (url.hostname !== "github.com" || releasesIndex < 2) {
      return undefined;
    }

    const owner = parts[0];
    const repo = parts[1];
    return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  } catch {
    return undefined;
  }
}

function readUpdateUnavailable(network: NetworkSettings, currentVersion: string): UpdateCheckResult | undefined {
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

  return undefined;
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
