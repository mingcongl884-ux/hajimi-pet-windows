import type { AgentPermissionMode } from "../../electron/settingsStore.js";

export type RemoteBridgeTargetId = "local" | string;
export type RemoteBridgeStatus = "disabled" | "listening" | "connected" | "error";

export type RemoteToolName =
  | "listFiles"
  | "readFile"
  | "writeFile"
  | "inspectDocument"
  | "createSpreadsheet"
  | "splitSpreadsheet"
  | "systemStatus"
  | "processList"
  | "openApplication"
  | "runCommand";

export type RemoteToolDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission-denied" | "review-required" };

export type RemoteTrustedDevice = {
  id: string;
  name: string;
  token: string;
  permissionMode: AgentPermissionMode;
  allowedWorkspace: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
};

export type RemoteKnownHost = {
  id: string;
  name: string;
  address: string;
  token: string;
  permissionMode: AgentPermissionMode;
  lastConnectedAt?: string;
};

export type RemoteBridgeSettings = {
  enabled: boolean;
  deviceName: string;
  activeTargetId: RemoteBridgeTargetId;
  host: {
    port: number;
    status: RemoteBridgeStatus;
    pairingCode?: string;
    pairingExpiresAt?: string;
    permissionMode: AgentPermissionMode;
  };
  trustedDevices: RemoteTrustedDevice[];
  knownHosts: RemoteKnownHost[];
};

const DEFAULT_TOOLS = new Set<RemoteToolName>([
  "listFiles",
  "readFile",
  "inspectDocument",
  "systemStatus",
  "processList"
]);
const AUTO_TOOLS = new Set<RemoteToolName>([
  ...DEFAULT_TOOLS,
  "writeFile",
  "createSpreadsheet",
  "splitSpreadsheet"
]);

export function defaultRemoteBridgeSettings(deviceName = "HaJiMi Host"): RemoteBridgeSettings {
  return {
    enabled: false,
    deviceName,
    activeTargetId: "local",
    host: {
      port: 18031,
      status: "disabled",
      permissionMode: "default"
    },
    trustedDevices: [],
    knownHosts: []
  };
}

export function cloneRemoteBridgeSettings(settings?: Partial<RemoteBridgeSettings>): RemoteBridgeSettings {
  const defaults = defaultRemoteBridgeSettings();
  return {
    ...defaults,
    ...settings,
    activeTargetId: settings?.activeTargetId || "local",
    host: {
      ...defaults.host,
      ...settings?.host
    },
    trustedDevices: settings?.trustedDevices ? settings.trustedDevices.map((device) => ({ ...device })) : [],
    knownHosts: settings?.knownHosts ? settings.knownHosts.map((host) => ({ ...host })) : []
  };
}

export function canRunRemoteTool(permissionMode: AgentPermissionMode, tool: RemoteToolName): RemoteToolDecision {
  if (permissionMode === "full-access") {
    return { allowed: true };
  }
  if (permissionMode === "auto-review") {
    return AUTO_TOOLS.has(tool) ? { allowed: true } : { allowed: false, reason: "review-required" };
  }
  return DEFAULT_TOOLS.has(tool) ? { allowed: true } : { allowed: false, reason: "permission-denied" };
}
