const DEFAULT_MAX_CHARS = 12000;

export async function fileToMessageContent(file: File, maxChars = DEFAULT_MAX_CHARS): Promise<string> {
  const text = await readFileText(file);
  const trimmed = text.length > maxChars ? `${text.slice(0, maxChars)}\n\n...[已截断 ${text.length - maxChars} 个字符]` : text;

  return [
    `我上传了文件：${file.name}`,
    `大小：${formatBytes(file.size)}`,
    "",
    "请读取并处理这个文件内容：",
    "```",
    trimmed,
    "```"
  ].join("\n");
}

async function readFileText(file: File): Promise<string> {
  try {
    const text = await file.text();
    if (text.trim()) {
      return text;
    }
    return "(文件为空或不是可读取的文本内容)";
  } catch {
    return "(这个文件不是可读取的文本内容，请根据文件名和大小说明你需要什么后续信息)";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
