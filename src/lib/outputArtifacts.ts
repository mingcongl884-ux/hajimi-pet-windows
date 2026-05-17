import type { ChatFileOutput } from "../../electron/chatClient.js";

export type OutputArtifact = {
  file: ChatFileOutput;
  displayName: string;
  extensionLabel: string;
  sizeLabel?: string;
  locationLabel: string;
};

export function buildOutputArtifacts(files: readonly ChatFileOutput[] | undefined): OutputArtifact[] {
  const seen = new Set<string>();
  return (files ?? []).flatMap((file) => {
    const path = file.path.trim();
    if (!path) {
      return [];
    }
    const key = `${path.toLowerCase()}:${file.size ?? ""}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    const displayName = (file.name || basename(path) || path).trim();
    return [{
      file,
      displayName,
      extensionLabel: extensionLabel(displayName),
      sizeLabel: file.size === undefined ? undefined : formatBytes(file.size),
      locationLabel: dirnameLabel(path)
    }];
  });
}

export function formatOutputArtifactHeader(count: number): string {
  return count <= 1 ? "本次生成 1 个文件" : `本次生成 ${count} 个文件`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionLabel(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 && index < name.length - 1
    ? name.slice(index + 1).toUpperCase()
    : "FILE";
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function dirnameLabel(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return path;
  }
  const dir = normalized.slice(0, index);
  const parts = dir.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return dir;
  }
  return `.../${parts.slice(-2).join("/")}`;
}
