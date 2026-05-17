export function normalizeOfficeErrorMessage(error: unknown): string {
  const message = collectErrorText(error);
  const compact = message.replace(/\s+/g, " ").trim();

  if (/cancel|abort|已停止|OpenClaw task was cancelled/i.test(compact)) {
    return "已停止生成。";
  }
  if (/timed out|timeout|超时/i.test(compact)) {
    return [
      "任务处理超时。",
      "哈基Mi 已停止等待这次结果。",
      "可以把任务拆小一点后重试。"
    ].join("\n");
  }
  if (/AGENTS\.md|workspace template|templates/i.test(compact)) {
    return [
      "OpenClaw 工作区模板缺失。",
      "哈基Mi 可以在系统页的能力体检里自动补齐。",
      "修复后重新发送任务即可。"
    ].join("\n");
  }
  if (/Bundled OpenClaw runtime was not found|openclaw.*not found|ENOENT|spawn/i.test(compact)) {
    return [
      "OpenClaw 暂不可用。",
      "哈基Mi 已尝试切换兼容兜底处理。",
      "如果仍失败，请到系统页运行能力体检。"
    ].join("\n");
  }
  if (/native binary not found|pathToClaudeCodeExecutable|Claude Code executable|claude\.exe/i.test(compact)) {
    return [
      "没有找到 Claude Code 执行器。",
      "高级办公需要本机可运行 claude --version，或通过 CC Switch 配好 Claude 命令。",
      "配置完成后重新发送任务。"
    ].join("\n");
  }
  if (/permission|denied|sandbox|not allowed|outside workspace|权限/i.test(compact)) {
    return [
      "当前权限不允许执行这一步。",
      "哈基Mi 已拦住可能越界的操作。",
      "可以切换到自动审查或完全访问权限后重试。"
    ].join("\n");
  }
  if (/remote bridge|relay|pairing|disconnect|ECONNRESET|ECONNREFUSED|远程/i.test(compact)) {
    return [
      "远程电脑连接不可用。",
      "哈基Mi 没有继续执行远程工具。",
      "请重新连接桥接，或切回本机执行。"
    ].join("\n");
  }
  if (/400|Bad Request|tool|function/i.test(compact)) {
    return [
      "模型拒绝了这次工具请求。",
      "哈基Mi 已尝试兼容格式。",
      "可以换一个模型，或切到 Claude Agent SDK 后重试。"
    ].join("\n");
  }
  if (/API key|required|missing-api-key/i.test(compact)) {
    return [
      "模型 API Key 还不可用。",
      "哈基Mi 没有发起办公任务。",
      "请到模型页保存并测试连接后重试。"
    ].join("\n");
  }

  return message || "办公任务失败。";
}

function collectErrorText(error: unknown): string {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return [error.message, collectErrorText(cause)].filter(Boolean).join("\n");
  }
  return String(error);
}
