import type { AgentPermissionMode } from "../../electron/settingsStore.js";

export type RemoteBridgeTargetId = "local" | string;
export type RemoteBridgeStatus = "disabled" | "listening" | "connected" | "error";

export type RemoteToolName =
  | "listFiles"
  | "readFile"
  | "searchFiles"
  | "writeFile"
  | "batchFiles"
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
  transport?: "http" | "relay";
  relaySessionId?: string;
  lastConnectedAt?: string;
};

export type RemoteBridgeSettings = {
  enabled: boolean;
  deviceName: string;
  activeTargetId: RemoteBridgeTargetId;
  relay: {
    enabled: boolean;
    url: string;
    status: RemoteBridgeStatus;
    lastError?: string;
  };
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

export type RemoteBridgeTargetSummary = {
  label: string;
  description: string;
};

export type RemoteBridgeStatusSummary = {
  local: {
    status: RemoteBridgeStatus;
    label: string;
  };
  relay: {
    status: RemoteBridgeStatus;
    label: string;
  };
  activeTarget: RemoteBridgeTargetSummary;
};

const DEFAULT_TOOLS = new Set<RemoteToolName>([
  "listFiles",
  "readFile",
  "searchFiles",
  "inspectDocument",
  "systemStatus",
  "processList"
]);
const AUTO_TOOLS = new Set<RemoteToolName>([
  ...DEFAULT_TOOLS,
  "writeFile",
  "batchFiles",
  "createSpreadsheet",
  "splitSpreadsheet"
]);
const STATUS_LABELS: Record<RemoteBridgeStatus, string> = {
  disabled: "Disabled",
  listening: "Listening",
  connected: "Connected",
  error: "Error"
};

export function defaultRemoteBridgeSettings(deviceName = "HaJiMi Host"): RemoteBridgeSettings {
  return {
    enabled: false,
    deviceName,
    activeTargetId: "local",
    relay: {
      enabled: false,
      url: "",
      status: "disabled"
    },
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
    relay: {
      ...defaults.relay,
      ...settings?.relay
    },
    host: {
      ...defaults.host,
      ...settings?.host
    },
    trustedDevices: settings?.trustedDevices ? settings.trustedDevices.map((device) => ({ ...device })) : [],
    knownHosts: settings?.knownHosts ? settings.knownHosts.map((host) => ({ ...host })) : []
  };
}

export function ensureRemoteBridgeSettings<T extends { remoteBridge?: Partial<RemoteBridgeSettings> }>(
  settings: T
): T & { remoteBridge: RemoteBridgeSettings } {
  return {
    ...settings,
    remoteBridge: cloneRemoteBridgeSettings(settings.remoteBridge)
  };
}

export function describeRemoteBridgeTarget(
  settings: RemoteBridgeSettings,
  targetId: RemoteBridgeTargetId = settings.activeTargetId
): RemoteBridgeTargetSummary {
  if (!targetId || targetId === "local") {
    return {
      label: "Local device",
      description: "Local device"
    };
  }

  const host = settings.knownHosts.find((item) => item.id === targetId && item.address.trim() && item.token.trim());
  if (!host) {
    return {
      label: "Remote device",
      description: "Selected remote device is no longer available"
    };
  }

  return {
    label: host.name || "Remote device",
    description: `Remote device: ${host.name || "Remote device"} (${host.address})`
  };
}

export function summarizeRemoteBridgeStatus(settings: RemoteBridgeSettings): RemoteBridgeStatusSummary {
  return {
    local: {
      status: settings.host.status,
      label: STATUS_LABELS[settings.host.status]
    },
    relay: {
      status: settings.relay.status,
      label: STATUS_LABELS[settings.relay.status]
    },
    activeTarget: describeRemoteBridgeTarget(settings)
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
