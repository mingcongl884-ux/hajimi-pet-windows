export type CapabilityStatus = "ready" | "warning" | "blocked";
export type CapabilityRepairKind = "automatic" | "assistant" | "manual";
export type CapabilityRepairActionId =
  | "repair-openclaw-runtime"
  | "restart-wechat-channel"
  | "restart-remote-bridge"
  | "assistant-diagnosis"
  | "configure-model"
  | "choose-workspace";

export type CapabilityRepairAction = {
  id: CapabilityRepairActionId;
  label: string;
  kind: CapabilityRepairKind;
};

export type CapabilityRow = {
  id: string;
  label: string;
  status: CapabilityStatus;
  message: string;
  fix?: string;
  repair?: CapabilityRepairAction;
};

export type CapabilityCheckResult = {
  checkedAt: string;
  rows: CapabilityRow[];
};

export type CapabilityRepairStatus = "repaired" | "needs-action" | "failed";

export type CapabilityRepairResult = {
  checkedAt: string;
  status: CapabilityRepairStatus;
  message: string;
  assistantMessage?: string;
  result?: CapabilityCheckResult;
};

export function summarizeCapabilities(rows: CapabilityRow[]): string {
  const ready = rows.filter((row) => row.status === "ready").map((row) => row.label);
  const warning = rows.filter((row) => row.status === "warning").map((row) => row.label);
  const blocked = rows.filter((row) => row.status === "blocked").map((row) => row.label);
  const parts = [];
  if (ready.length) {
    parts.push(`可用：${ready.join("、")}。`);
  }
  if (warning.length) {
    parts.push(`需配置：${warning.join("、")}。`);
  }
  if (blocked.length) {
    parts.push(`不可用：${blocked.join("、")}。`);
  }
  return parts.join("");
}

export function capabilityStatusLabel(status: CapabilityStatus): string {
  switch (status) {
    case "ready":
      return "可用";
    case "warning":
      return "需配置";
    case "blocked":
      return "不可用";
  }
}
