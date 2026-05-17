export function readDisplayErrorMessage(error: unknown, fallback = "请求失败"): string {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error || fallback);
  return stripElectronInvokePrefix(raw).trim() || fallback;
}

export function stripElectronInvokePrefix(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^(?:Error|ChatClientError|TypeError):\s*/i, "");
}
