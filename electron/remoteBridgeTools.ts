import type { AgentPermissionMode, AgentSettings } from "./settingsStore.js";
import {
  createSpreadsheetFile,
  inspectDocumentFile,
  splitSpreadsheetFile,
  buildProcessListCommand,
  buildSystemStatusCommand
} from "./officeTools.js";
import {
  listFiles,
  openApplication,
  readTextFile,
  runCommand,
  writeTextFile
} from "./agentClient.js";
import { canRunRemoteTool, type RemoteToolName } from "../src/lib/remoteBridge.js";

export type RemoteBridgeToolRequest = {
  workspaceDir: string;
  permissionMode: AgentPermissionMode;
  tool: RemoteToolName;
  args: Record<string, unknown>;
};

export async function executeRemoteBridgeTool(request: RemoteBridgeToolRequest) {
  const decision = canRunRemoteTool(request.permissionMode, request.tool);
  if (!decision.allowed) {
    throw new Error(`Remote tool denied: ${decision.reason}`);
  }

  const agent: AgentSettings = {
    workspaceDir: request.workspaceDir,
    permissionMode: request.permissionMode,
    allowCommands: request.permissionMode !== "default"
  };

  switch (request.tool) {
    case "listFiles":
      return { content: await listFiles(request.workspaceDir, String(request.args.path ?? ".")) };
    case "readFile":
      return { content: await readTextFile(request.workspaceDir, String(request.args.path ?? "")) };
    case "writeFile":
      return writeTextFile(agent, String(request.args.path ?? ""), String(request.args.content ?? ""));
    case "inspectDocument":
      return inspectDocumentFile(request.workspaceDir, String(request.args.path ?? ""));
    case "createSpreadsheet":
      return createSpreadsheetFile(agent, {
        path: String(request.args.path ?? ""),
        headers: readStringArray(request.args.headers),
        rows: readTableRows(request.args.rows)
      });
    case "splitSpreadsheet":
      return splitSpreadsheetFile(agent, {
        path: String(request.args.path ?? ""),
        parts: readOptionalNumber(request.args.parts),
        rowsPerFile: readOptionalNumber(request.args.rowsPerFile),
        outputDir: typeof request.args.outputDir === "string" ? request.args.outputDir : undefined
      });
    case "systemStatus":
      return { content: await runCommand({ ...agent, permissionMode: "full-access", allowCommands: true }, buildSystemStatusCommand()) };
    case "processList":
      return { content: await runCommand({ ...agent, permissionMode: "full-access", allowCommands: true }, buildProcessListCommand(readOptionalNumber(request.args.limit) ?? 12)) };
    case "openApplication":
      return { content: await openApplication(agent, String(request.args.appName ?? request.args.name ?? "")) };
    case "runCommand":
      return { content: await runCommand(agent, String(request.args.command ?? "")) };
  }
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function readTableRows(value: unknown): Array<Array<string | number | boolean | null | undefined>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((row) => Array.isArray(row) ? row.map(readCellValue) : [readCellValue(row)]);
}

function readCellValue(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  return String(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
