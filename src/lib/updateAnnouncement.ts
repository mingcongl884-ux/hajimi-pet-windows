export type UpdateAnnouncementInput = {
  version?: string;
  releaseNotes?: string;
};

const MAX_UPDATE_BUBBLE_LENGTH = 180;

export function formatUpdateAnnouncement(update: UpdateAnnouncementInput): string {
  const version = update.version ? ` ${update.version}` : "";
  const notes = summarizeReleaseNotes(update.releaseNotes);
  if (!notes) {
    return `发现新版本${version}，可以在系统页检查更新。`;
  }
  return truncate(`发现新版本${version}：${notes}`, MAX_UPDATE_BUBBLE_LENGTH);
}

export function summarizeReleaseNotes(releaseNotes?: string): string {
  if (!releaseNotes?.trim()) {
    return "";
  }

  return releaseNotes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
