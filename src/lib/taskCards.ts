export type TaskPhase = "starting" | "processing" | "completed" | "failed" | "cancelled";

export type TaskCard = {
  id: string;
  title: string;
  plan: string[];
  phase: TaskPhase;
  startedAt: number;
  finishedAt?: number;
  error?: string;
};

export function createTaskCard(input: string, now = Date.now()): TaskCard {
  return {
    id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: summarizeTaskTitle(input),
    plan: buildTaskPlan(input),
    phase: "starting",
    startedAt: now
  };
}

export function updateTaskPhase(task: TaskCard, phase: TaskPhase, now = Date.now(), error?: string): TaskCard {
  return {
    ...task,
    phase,
    finishedAt: phase === "completed" || phase === "failed" || phase === "cancelled" ? now : task.finishedAt,
    error
  };
}

export function shouldShowTaskCard(input: string, hasAttachment = false): boolean {
  if (hasAttachment) {
    return true;
  }
  const text = input.replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) {
    return false;
  }
  if (isCasualMessage(text) || isPetOnlyCommand(text)) {
    return false;
  }

  const hasWorkObject = /(xlsx|xlsm?|csv|tsv|docx?|pdf|pptx?|readme|\.md\b|文件|附件|表格|excel|数据|项目|目录|代码|脚本|报告|内存|磁盘|进程|启动项|系统|电脑|桌面|微信|浏览器)/i.test(text);
  const hasWorkVerb = /(帮我|请|处理|分析|拆分|生成|保存|导出|修改|读取|检查|统计|转换|整理|搜索|运行|执行|打开|创建|写|修复|维护|清理|压缩|重命名|删除|安装|更新)/i.test(text);
  return hasWorkObject && hasWorkVerb;
}

function isCasualMessage(text: string) {
  return /^(你好|您好|哈喽|嗨|在吗|hello|hi|hey|ok|好的|好|嗯|谢谢|你是谁|你叫什么|你能做什么|可以吗|辛苦了)[。！!？?\s]*$/i.test(text);
}

function isPetOnlyCommand(text: string) {
  return text.length <= 24 && /(到屏幕|屏幕中间|过来|去左边|去右边|左边|右边|中间|跳|挥手|跑|安静|自己去玩|别动|停下)/i.test(text);
}

export function buildTaskPlan(input: string): string[] {
  const text = input.toLowerCase();
  const steps = ["读取相关文件和当前项目"];

  if (/(xlsx|xls|csv|表格|excel|拆分|统计|数据)/i.test(text)) {
    steps.push("处理表格数据");
  } else if (/(docx|pdf|文档|文件|readme|报告)/i.test(text)) {
    steps.push("分析文件内容");
  } else if (/(系统|内存|磁盘|进程|启动项|电脑)/i.test(text)) {
    steps.push("检查系统状态");
  } else {
    steps.push("理解需求并规划执行");
  }

  if (/(保存|导出|输出|生成|桌面|desktop|写入|拆分)/i.test(text)) {
    steps.push("保存输出文件");
  }

  steps.push("回报结果和路径");
  return [...new Set(steps)].slice(0, 4);
}

export function summarizeTaskTitle(input: string, maxLength = 28): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "办公任务";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function formatTaskStatus(phase: TaskPhase): string {
  switch (phase) {
    case "starting":
      return "准备中";
    case "processing":
      return "处理中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
  }
}

export function formatTaskElapsed(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
