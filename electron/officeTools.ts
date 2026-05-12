import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import JSZip from "jszip";
import type { ChatFileOutput } from "./chatClient.js";
import type { AgentSettings } from "./settingsStore.js";

export type OfficeToolResult = {
  content: string;
  fileOutputs?: ChatFileOutput[];
};

type SpreadsheetCreateOptions = {
  path: string;
  headers?: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
};

type SpreadsheetSplitOptions = {
  path: string;
  parts?: number;
  rowsPerFile?: number;
  outputDir?: string;
};

const MAX_INSPECT_ROWS = 80;
const MAX_INSPECT_CHARS = 12000;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".log"]);
const SPREADSHEET_EXTENSIONS = new Set([".csv", ".tsv", ".xlsx", ".xlsm", ".xltx", ".xltm"]);

export async function inspectDocumentFile(workspaceDir: string, relativePath: string): Promise<OfficeToolResult> {
  const filePath = resolveReadablePath(workspaceDir, relativePath);
  const extension = extname(relativePath).toLowerCase();

  if (extension === ".xlsx" || extension === ".xlsm" || extension === ".xltx" || extension === ".xltm") {
    const sheets = await readXlsxRows(filePath);
    return {
      content: trimToolOutput([
        `Excel workbook: ${relativePath}`,
        ...sheets.flatMap((sheet) => [
          "",
          `Sheet: ${sheet.name}`,
          ...sheet.rows.slice(0, MAX_INSPECT_ROWS).map((row) => row.join(" | "))
        ])
      ].join("\n"))
    };
  }

  if (extension === ".docx") {
    return {
      content: trimToolOutput(`Word document: ${relativePath}\n\n${await readDocxText(filePath)}`)
    };
  }

  if (extension === ".pdf") {
    return {
      content: trimToolOutput(`PDF document: ${relativePath}\n\n${await readPdfText(filePath)}`)
    };
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      content: trimToolOutput(`${extension.slice(1).toUpperCase() || "Text"} file: ${relativePath}\n\n${await readFile(filePath, "utf8")}`)
    };
  }

  const info = await stat(filePath);
  return {
    content: `Binary file: ${relativePath}\nSize: ${info.size} bytes\nUse a specialized app or convert it to txt/csv/xlsx/docx/pdf for deeper inspection.`
  };
}

export async function createSpreadsheetFile(
  agent: AgentSettings,
  options: SpreadsheetCreateOptions
): Promise<OfficeToolResult> {
  const rows = normalizeTableRows(options.headers, options.rows);
  const outputPath = resolveWritablePath(agent, options.path);
  await mkdir(dirname(outputPath), { recursive: true });

  if (extname(options.path).toLowerCase() === ".xlsx") {
    await writeFile(outputPath, await buildXlsxBuffer(rows));
  } else {
    await writeFile(outputPath, stringifyCsv(rows), "utf8");
  }

  const info = await stat(outputPath);
  return {
    content: `Created spreadsheet ${options.path} with ${Math.max(0, rows.length - 1)} data rows.`,
    fileOutputs: [{ path: options.path, name: basename(options.path), size: info.size }]
  };
}

export async function splitSpreadsheetFile(
  agent: AgentSettings,
  options: SpreadsheetSplitOptions
): Promise<OfficeToolResult> {
  const sourcePath = resolveReadablePath(agent.workspaceDir, options.path);
  const sheets = await readSpreadsheetRows(sourcePath, options.path);
  const rows = sheets[0]?.rows ?? [];
  if (rows.length <= 1) {
    return { content: `No data rows found in ${options.path}.` };
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const parts = clampInteger(options.parts ?? Math.ceil(dataRows.length / Math.max(1, options.rowsPerFile ?? dataRows.length)), 1, 50);
  const chunkSize = options.rowsPerFile
    ? clampInteger(options.rowsPerFile, 1, dataRows.length)
    : Math.ceil(dataRows.length / parts);
  const outputDir = options.outputDir?.trim() || `${basename(options.path, extname(options.path))}-split`;
  const outputs: ChatFileOutput[] = [];

  for (let index = 0; index < dataRows.length; index += chunkSize) {
    const chunkIndex = outputs.length + 1;
    const chunkRows = [header, ...dataRows.slice(index, index + chunkSize)];
    const outputRelativePath = join(outputDir, `${basename(options.path, extname(options.path))}-part-${chunkIndex}.csv`);
    const outputPath = resolveWritablePath(agent, outputRelativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, stringifyCsv(chunkRows), "utf8");
    const info = await stat(outputPath);
    outputs.push({ path: outputRelativePath, name: basename(outputRelativePath), size: info.size });
  }

  return {
    content: `Created ${outputs.length} split files from ${options.path}.`,
    fileOutputs: outputs
  };
}

export async function batchFiles(
  agent: AgentSettings,
  operation: "copy" | "move",
  sourceDir: string,
  outputDir: string,
  extension?: string
): Promise<OfficeToolResult> {
  const policyMode = agent.permissionMode ?? (agent.allowCommands ? "auto-review" : "default");
  if (operation === "move" && policyMode !== "full-access") {
    return { content: "Move is only allowed in full-access mode. Use copy in default or auto-review mode." };
  }

  const sourceRoot = resolveReadablePath(agent.workspaceDir, sourceDir || ".");
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const normalizedExtension = extension?.trim().toLowerCase();
  const files = entries.filter((entry) =>
    entry.isFile() && (!normalizedExtension || entry.name.toLowerCase().endsWith(normalizedExtension))
  );
  const outputs: ChatFileOutput[] = [];

  for (const entry of files.slice(0, 200)) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetRelativePath = join(outputDir, entry.name);
    const targetPath = resolveWritablePath(agent, targetRelativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    if (operation === "move") {
      await rename(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
    const info = await stat(targetPath);
    outputs.push({ path: targetRelativePath, name: entry.name, size: info.size });
  }

  return {
    content: `${operation === "copy" ? "Copied" : "Moved"} ${outputs.length} files to ${outputDir}.`,
    fileOutputs: outputs
  };
}

export function buildSystemStatusCommand(): string {
  return [
    "$os = Get-CimInstance Win32_OperatingSystem",
    "$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1",
    "$memTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)",
    "$memFree = [math]::Round($os.FreePhysicalMemory / 1MB, 2)",
    "$drives = Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free",
    "[pscustomobject]@{ Computer=$env:COMPUTERNAME; OS=$os.Caption; CPU=$cpu.Name; MemoryTotalGB=$memTotal; MemoryFreeGB=$memFree } | Format-List",
    "$drives | Format-Table -AutoSize"
  ].join("; ");
}

export function buildProcessListCommand(limit = 12): string {
  const safeLimit = clampInteger(limit, 1, 50);
  return `Get-Process | Sort-Object CPU -Descending | Select-Object -First ${safeLimit} Name, Id, CPU, WorkingSet | Format-Table -AutoSize`;
}

async function readSpreadsheetRows(filePath: string, displayPath: string): Promise<Array<{ name: string; rows: string[][] }>> {
  const extension = extname(displayPath).toLowerCase();
  if (extension === ".csv" || extension === ".tsv") {
    const delimiter = extension === ".tsv" ? "\t" : ",";
    return [{ name: "Sheet1", rows: parseDelimited(await readFile(filePath, "utf8"), delimiter) }];
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return readXlsxRows(filePath);
  }
  throw new Error(`Unsupported spreadsheet type: ${displayPath}`);
}

async function readXlsxRows(filePath: string): Promise<Array<{ name: string; rows: string[][] }>> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(await readZipText(zip, "xl/sharedStrings.xml"));
  const sheets = workbookXml
    ? parseWorkbookSheets(workbookXml, relsXml)
    : listWorksheetPaths(zip).map((path, index) => ({ name: `Sheet${index + 1}`, path }));

  const results: Array<{ name: string; rows: string[][] }> = [];
  for (const sheet of sheets) {
    const sheetXml = await readZipText(zip, sheet.path);
    if (sheetXml) {
      results.push({ name: sheet.name, rows: parseSheetRows(sheetXml, sharedStrings) });
    }
  }
  return results.length ? results : [{ name: "Sheet1", rows: [] }];
}

async function readDocxText(filePath: string): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const documentXml = await readZipText(zip, "word/document.xml");
    if (!documentXml) {
      return "(No document.xml text found.)";
    }
    return readXmlTextTags(documentXml).join("\n").trim() || "(No readable text found.)";
  } catch {
    return "(Unable to parse this Word document.)";
  }
}

async function readPdfText(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const text = bytes.toString("latin1");
  const snippets = Array.from(text.matchAll(/\(([^()\r\n]{2,200})\)\s*Tj/g))
    .map((match) => decodePdfString(match[1]))
    .filter(Boolean);
  if (snippets.length) {
    return snippets.slice(0, 200).join("\n");
  }
  return "(Basic PDF inspection could not extract text. Advanced PDF parsing is not bundled yet.)";
}

function normalizeTableRows(headers: SpreadsheetCreateOptions["headers"], rows: SpreadsheetCreateOptions["rows"]): string[][] {
  const normalized = rows.map((row) => row.map((cell) => cell == null ? "" : String(cell)));
  return headers?.length ? [headers.map(String), ...normalized] : normalized;
}

async function buildXlsxBuffer(rows: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '</Types>'
  ].join(""));
  zip.file("_rels/.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>"
  ].join(""));
  zip.file("xl/workbook.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>',
    "</workbook>"
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    "</Relationships>"
  ].join(""));
  zip.file("xl/worksheets/sheet1.xml", buildWorksheetXml(rows));
  return zip.generateAsync({ type: "nodebuffer" });
}

function buildWorksheetXml(rows: string[][]): string {
  const rowXml = rows.map((row, rowIndex) => {
    const cellXml = row.map((cell, cellIndex) => {
      const ref = `${columnName(cellIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cellXml}</row>`;
  }).join("");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${rowXml}</sheetData>`,
    "</worksheet>"
  ].join("");
}

function parseDelimited(content: string, delimiter: string): string[][] {
  return content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function stringifyCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function parseWorkbookSheets(workbookXml: string, workbookRelsXml?: string): Array<{ name: string; path: string }> {
  const relationships = parseWorkbookRelationships(workbookRelsXml);
  return Array.from(workbookXml.matchAll(/<sheet\b[^>]*>/g)).map((match, index) => {
    const tag = match[0];
    const relId = readXmlAttribute(tag, "r:id");
    const target = relId ? relationships.get(relId) : undefined;
    return {
      name: readXmlAttribute(tag, "name") || `Sheet${index + 1}`,
      path: target ? normalizeWorkbookTarget(target) : `xl/worksheets/sheet${index + 1}.xml`
    };
  });
}

function parseWorkbookRelationships(workbookRelsXml?: string): Map<string, string> {
  const relationships = new Map<string, string>();
  if (!workbookRelsXml) {
    return relationships;
  }
  for (const match of workbookRelsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = readXmlAttribute(match[0], "Id");
    const target = readXmlAttribute(match[0], "Target");
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
  return Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) =>
    readXmlTextTags(match[1]).join("")
  );
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
  return Array.from(sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
    .map((rowMatch) => Array.from(rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g))
      .map((cellMatch) => readCellValue(cellMatch[1], cellMatch[2], sharedStrings)))
    .filter((row) => row.some((cell) => cell.trim()));
}

function readCellValue(cellAttributes: string, cellXml: string, sharedStrings: string[]): string {
  const type = readXmlAttribute(`<c ${cellAttributes}>`, "t");
  if (type === "s") {
    const index = Number(readXmlValue(cellXml));
    return Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
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

function readXmlAttribute(tag: string, attribute: string): string | undefined {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`${escaped}\\s*=\\s*"([^"]*)"|${escaped}\\s*=\\s*'([^']*)'`));
  const value = match?.[1] ?? match?.[2];
  return value ? decodeXml(value) : undefined;
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

function resolveReadablePath(workspaceDir: string, relativePath: string): string {
  const root = resolve(workspaceDir);
  const target = resolve(root, relativePath || ".");
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`Path is outside workspace: ${relativePath}`);
  }
  return target;
}

function resolveWritablePath(
  agent: AgentSettings,
  relativePath: string,
  homeDir = process.env.USERPROFILE ?? process.env.HOME ?? ""
): string {
  const mode = agent.permissionMode ?? (agent.allowCommands ? "auto-review" : "default");
  const normalizedPath = relativePath.replace(/\//g, "\\").replace(/^\.\\/, "");
  const desktopMatch = normalizedPath.match(/^(?:desktop|桌面)\\(.+)/i);
  if (desktopMatch && mode === "default") {
    throw new Error(`Path is outside workspace: ${relativePath}`);
  }
  if (mode !== "default" && desktopMatch && homeDir) {
    return resolve(homeDir, "Desktop", desktopMatch[1]);
  }
  if (mode !== "default" && isAbsolute(relativePath) && homeDir && isInsideKnownUserOutputDir(relativePath, homeDir)) {
    return resolve(relativePath);
  }
  return resolveReadablePath(agent.workspaceDir, relativePath);
}

function isInsideKnownUserOutputDir(filePath: string, homeDir: string): boolean {
  const target = resolve(filePath).toLowerCase();
  const desktopRoot = resolve(homeDir, "Desktop").toLowerCase();
  const downloadsRoot = resolve(homeDir, "Downloads").toLowerCase();
  return target === desktopRoot || target.startsWith(`${desktopRoot}${sep}`) ||
    target === downloadsRoot || target.startsWith(`${downloadsRoot}${sep}`);
}

function columnName(index: number): string {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function trimToolOutput(output: string): string {
  return output.length > MAX_INSPECT_CHARS ? `${output.slice(0, MAX_INSPECT_CHARS)}\n...truncated...` : output;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .trim();
}
