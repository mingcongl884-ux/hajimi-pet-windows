import JSZip from "jszip";
import type { ChatMessage } from "../../electron/chatClient.js";

const DEFAULT_MAX_CHARS = 12000;
const MAX_EXCEL_ROWS_PER_SHEET = 120;
const MAX_EXCEL_SHEETS = 8;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".ps1",
  ".bat",
  ".cmd",
  ".sh",
  ".yml",
  ".yaml",
  ".log"
]);

const XLSX_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xltx", ".xltm"]);

type ReadResult = {
  label: string;
  prompt: string;
  content: string;
};

export type PromptAttachment = {
  id: string;
  name: string;
  size: number;
  label: string;
  prompt: string;
  content: string;
};

type WorkbookSheet = {
  name: string;
  path: string;
};

export async function fileToMessageContent(file: File, maxChars = DEFAULT_MAX_CHARS): Promise<string> {
  const result = await readFileForPrompt(file);
  const content = truncateContent(result.content, maxChars);

  return [
    `我上传了文件：${file.name}`,
    `大小：${formatBytes(file.size)}`,
    `类型：${result.label}`,
    "",
    result.prompt,
    "```",
    content,
    "```"
  ].join("\n");
}

export async function fileToPromptAttachment(file: File, maxChars = DEFAULT_MAX_CHARS): Promise<PromptAttachment> {
  const result = await readFileForPrompt(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    label: result.label,
    prompt: result.prompt,
    content: truncateContent(result.content, maxChars)
  };
}

export function buildAttachmentMessage(instruction: string, attachments: PromptAttachment[]): ChatMessage {
  const visibleInstruction = instruction.trim();
  const attachmentSummary = attachments.map((attachment) =>
    `附件：${attachment.name} (${formatBytes(attachment.size)})`
  );
  const displayContent = [visibleInstruction, ...attachmentSummary].filter(Boolean).join("\n");
  const promptParts = attachments.map((attachment) => [
    `文件：${attachment.name}`,
    `大小：${formatBytes(attachment.size)}`,
    `类型：${attachment.label}`,
    "",
    attachment.prompt,
    "```",
    attachment.content,
    "```"
  ].join("\n"));

  return {
    role: "user",
    content: [
      visibleInstruction || "请处理这些附件。",
      "",
      ...promptParts
    ].join("\n").trim(),
    displayContent: displayContent || "附件"
  };
}

async function readFileForPrompt(file: File): Promise<ReadResult> {
  if (isXlsxFile(file)) {
    return {
      label: "Excel 工作簿",
      prompt: "请读取并处理这个 Excel 文件内容：",
      content: await readXlsxText(file)
    };
  }

  if (isTextLikeFile(file)) {
    return {
      label: file.type || "文本文件",
      prompt: "请读取并处理这个文件内容：",
      content: await readFileText(file)
    };
  }

  return {
    label: file.type || "二进制文件",
    prompt: "这个文件不是可直接读取的文本内容，请根据文件名、大小和我的后续说明处理：",
    content: "(无法直接读取二进制正文。请说明你希望我对这个文件做什么，或上传文本、CSV、Markdown、JSON、XML、代码文件、xlsx 表格等可解析格式。)"
  };
}

async function readFileText(file: File): Promise<string> {
  try {
    const text = await file.text();
    if (text.trim()) {
      return text;
    }
    return "(文件为空或没有可读取的文本内容。)";
  } catch {
    return "(这个文件不是可读取的文本内容，请根据文件名和大小说明你需要什么后续信息。)";
  }
}

async function readXlsxText(file: File): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const workbookXml = await readZipText(zip, "xl/workbook.xml");
    const workbookRelsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
    const sharedStrings = parseSharedStrings(await readZipText(zip, "xl/sharedStrings.xml"));
    const sheets = workbookXml
      ? parseWorkbookSheets(workbookXml, workbookRelsXml)
      : listWorksheetPaths(zip).map((path, index) => ({ name: `Sheet${index + 1}`, path }));
    const resolvedSheets = sheets.length
      ? sheets
      : listWorksheetPaths(zip).map((path, index) => ({ name: `Sheet${index + 1}`, path }));
    const lines = [`Excel: ${file.name}`];

    for (const sheet of resolvedSheets.slice(0, MAX_EXCEL_SHEETS)) {
      const sheetXml = await readZipText(zip, sheet.path);
      if (!sheetXml) {
        continue;
      }
      const rows = parseSheetRows(sheetXml, sharedStrings).slice(0, MAX_EXCEL_ROWS_PER_SHEET);
      if (!rows.length) {
        continue;
      }
      lines.push("", `Sheet: ${sheet.name}`);
      for (const row of rows) {
        lines.push(row.join(" | "));
      }
    }

    return lines.length > 1 ? lines.join("\n") : "(Excel 文件里没有读取到可用单元格内容。)";
  } catch {
    return "(Excel 文件解析失败。请确认文件没有损坏，或另存为 xlsx 后重新上传。)";
  }
}

function parseWorkbookSheets(workbookXml: string, workbookRelsXml?: string): WorkbookSheet[] {
  const relationships = parseWorkbookRelationships(workbookRelsXml);
  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = match[0];
    const name = readXmlAttribute(tag, "name") || `Sheet${sheets.length + 1}`;
    const relId = readXmlAttribute(tag, "r:id");
    const target = relId ? relationships.get(relId) : undefined;
    sheets.push({
      name,
      path: target ? normalizeWorkbookTarget(target) : `xl/worksheets/sheet${sheets.length + 1}.xml`
    });
  }
  return sheets;
}

function parseWorkbookRelationships(workbookRelsXml?: string): Map<string, string> {
  const relationships = new Map<string, string>();
  if (!workbookRelsXml) {
    return relationships;
  }
  for (const match of workbookRelsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = readXmlAttribute(tag, "Id");
    const target = readXmlAttribute(tag, "Target");
    if (id && target) {
      relationships.set(id, target);
    }
  }
  return relationships;
}

function parseSharedStrings(sharedStringsXml?: string): string[] {
  if (!sharedStringsXml) {
    return [];
  }
  return Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) => {
    const textParts = readXmlTextTags(match[1]);
    return textParts.length ? textParts.join("") : stripXmlTags(match[1]);
  });
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const value = readCellValue(cellMatch[1], cellMatch[2], sharedStrings);
      if (value) {
        cells.push(value);
      }
    }
    if (cells.length) {
      rows.push(cells);
    }
  }
  return rows;
}

function readCellValue(cellAttributes: string, cellXml: string, sharedStrings: string[]): string {
  const type = readXmlAttribute(`<c ${cellAttributes}>`, "t");
  if (type === "s") {
    const index = Number(readXmlValue(cellXml));
    return Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
  }
  if (type === "inlineStr") {
    return readXmlTextTags(cellXml).join("").trim();
  }
  return readXmlValue(cellXml).trim();
}

function readXmlValue(xml: string): string {
  const match = xml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  return match ? decodeXml(match[1]) : "";
}

function readXmlTextTags(xml: string): string[] {
  return Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((match) => decodeXml(match[1]));
}

function stripXmlTags(xml: string): string {
  return decodeXml(xml.replace(/<[^>]+>/g, "")).trim();
}

function readXmlAttribute(tag: string, attribute: string): string | undefined {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`${escaped}\\s*=\\s*"([^"]*)"|${escaped}\\s*=\\s*'([^']*)'`));
  const value = match?.[1] ?? match?.[2];
  return value ? decodeXml(value) : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => safeCodePoint(Number.parseInt(code, 16)));
}

function safeCodePoint(code: number): string {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

async function readZipText(zip: JSZip, path: string): Promise<string | undefined> {
  return zip.file(path)?.async("text");
}

function listWorksheetPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
}

function normalizeWorkbookTarget(target: string): string {
  const normalized = target.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
  if (normalized.startsWith("xl/")) {
    return normalized;
  }
  return `xl/${normalized.replace(/^\.\.\//, "")}`;
}

function truncateContent(content: string, maxChars: number): string {
  return content.length > maxChars
    ? `${content.slice(0, maxChars)}\n\n...[已截断 ${content.length - maxChars} 个字符]`
    : content;
}

function isXlsxFile(file: File): boolean {
  return XLSX_EXTENSIONS.has(getFileExtension(file.name));
}

function isTextLikeFile(file: File): boolean {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

function getFileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
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
