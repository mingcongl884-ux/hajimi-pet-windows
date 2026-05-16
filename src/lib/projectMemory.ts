export type ProjectMemoryFile = {
  path: string;
  name: string;
  size?: number;
  at: string;
};

export type ProjectMemoryTask = {
  title: string;
  at: string;
};

export type ProjectMemoryPreferences = {
  outputFolder?: string;
  spreadsheetFormat?: "xlsx" | "csv";
  language?: string;
};

export type ProjectMemory = {
  projectId: string;
  recentTasks: ProjectMemoryTask[];
  recentFiles: ProjectMemoryFile[];
  preferences: ProjectMemoryPreferences;
  updatedAt: string;
};

export type ProjectMemoryUpdate = {
  projectId: string;
  task?: string;
  files?: Array<{ path: string; name?: string; size?: number }>;
  at?: string;
};

export type ProjectMemorySuggestion = {
  label: string;
  prompt: string;
};

const MAX_TASKS = 8;
const MAX_FILES = 12;

export function updateProjectMemory(current: ProjectMemory | undefined, update: ProjectMemoryUpdate): ProjectMemory {
  const at = update.at ?? new Date().toISOString();
  const taskTitle = summarizeMemoryTask(update.task ?? "");
  const nextTasks = taskTitle
    ? [{ title: taskTitle, at }, ...(current?.recentTasks ?? [])].slice(0, MAX_TASKS)
    : current?.recentTasks ?? [];
  const nextFiles = dedupeFiles([
    ...(update.files ?? []).map((file) => ({
      path: file.path,
      name: file.name || file.path.split(/[\\/]/).pop() || file.path,
      size: file.size,
      at
    })),
    ...(current?.recentFiles ?? [])
  ]).slice(0, MAX_FILES);

  return {
    projectId: update.projectId,
    recentTasks: nextTasks,
    recentFiles: nextFiles,
    preferences: inferPreferences(current?.preferences ?? {}, nextFiles),
    updatedAt: at
  };
}

export function buildProjectMemorySuggestion(memory: ProjectMemory | undefined): ProjectMemorySuggestion | undefined {
  const task = memory?.recentTasks[0];
  if (task) {
    return {
      label: `上次：${task.title}`,
      prompt: `继续处理上次任务：${task.title}`
    };
  }
  const file = memory?.recentFiles[0];
  if (file) {
    return {
      label: `最近文件：${file.name}`,
      prompt: `继续处理最近文件：${file.name}`
    };
  }
  return undefined;
}

export function extractMemoryFilesFromDisplay(displayContent?: string): Array<{ path: string; name: string }> {
  if (!displayContent) {
    return [];
  }
  return displayContent
    .split(/\r?\n/)
    .map((line) => line.match(/附件[:：]\s*(.+?)(?:\s+\(|$)/)?.[1]?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ path: name, name }));
}

function summarizeMemoryTask(task: string) {
  const normalized = task.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 36 ? `${normalized.slice(0, 35)}…` : normalized;
}

function dedupeFiles(files: ProjectMemoryFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = file.path || file.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferPreferences(current: ProjectMemoryPreferences, files: ProjectMemoryFile[]): ProjectMemoryPreferences {
  const latestFile = files[0];
  const extension = latestFile?.name.split(".").pop()?.toLowerCase();
  const outputFolder = latestFile?.path.includes("\\") || latestFile?.path.includes("/")
    ? latestFile.path.replace(/[\\/][^\\/]+$/, "")
    : current.outputFolder;

  return {
    ...current,
    outputFolder,
    spreadsheetFormat: extension === "xlsx" || extension === "csv" ? extension : current.spreadsheetFormat
  };
}
