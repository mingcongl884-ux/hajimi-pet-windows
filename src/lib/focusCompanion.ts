export type FocusCompanionIntent = {
  title: string;
  durationMinutes: number;
};

const FOCUS_WORDS = /陪我|监督我|专注|番茄钟|陪跑|盯着我|提醒我/;
const OFFICE_WORDS = /readme|代码|文件|项目|修改|生成|分析|总结|搜索|运行|命令|脚本|报告|文档|测试|commit|git/i;
const DEFAULT_FOCUS_MINUTES = 30;
const MAX_FOCUS_MINUTES = 180;

export function resolveFocusCompanionIntent(input: string): FocusCompanionIntent | undefined {
  const text = input.trim();
  if (!text || OFFICE_WORDS.test(text) || !FOCUS_WORDS.test(text)) {
    return undefined;
  }

  const duration = readDurationMinutes(text) ?? DEFAULT_FOCUS_MINUTES;
  return {
    title: readFocusTitle(text),
    durationMinutes: Math.max(1, Math.min(MAX_FOCUS_MINUTES, duration))
  };
}

export function formatFocusCompanionDoneBubble(title: string): string {
  return `${title}这一轮到点啦，要不要看一下进度？`;
}

function readDurationMinutes(text: string): number | undefined {
  const match = text.match(/(\d{1,3})\s*(分钟|分|mins?|m)/i);
  return match ? Number(match[1]) : undefined;
}

function readFocusTitle(text: string): string {
  const cleaned = text
    .replace(/陪我|监督我|盯着我|提醒我/g, "")
    .replace(/\d{1,3}\s*(分钟|分|mins?|m)/gi, "")
    .replace(/专注|番茄钟|陪跑|一下|一会儿|一会/g, "")
    .trim();
  return cleaned || "专注";
}
