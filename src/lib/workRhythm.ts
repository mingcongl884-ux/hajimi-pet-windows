import type { AnimationState } from "./atlas.js";

export type WorkRhythmCue = {
  key: string;
  kind: "lunchNudge" | "afterHoursNudge";
  bubble: string;
  tone: "info" | "working";
  followCursor: boolean;
  followStatus: AnimationState;
};

type WorkRhythmOptions = {
  now: Date;
  activeRecently: boolean;
  bubbleOpen: boolean;
  seenCueKeys: ReadonlySet<string>;
};

const LUNCH_START_MINUTES = 12 * 60 + 10;
const LUNCH_END_MINUTES = 13 * 60 + 30;
const AFTER_WORK_START_MINUTES = 18 * 60 + 30;
const LATE_END_MINUTES = 21 * 60;

const REMINDERS: Record<WorkRhythmCue["kind"], string[]> = {
  lunchNudge: [
    "\u4e2d\u5348 12:10 \u4e86\uff0c\u5148\u7a0d\u5fae\u4f11\u606f\u4e00\u4e0b\uff0c\u559d\u53e3\u6c34\u518d\u7ee7\u7eed\u3002",
    "\u5df2\u7ecf\u5230\u5348\u4f11\u70b9\u4e86\uff0c\u5148\u628a\u624b\u5934\u7684\u4e8b\u653e\u4e00\u4e0b\u3002",
    "\u4e2d\u5348\u4e86\uff0c\u7ad9\u8d77\u6765\u6d3b\u52a8 1 \u5206\u949f\u518d\u56de\u6765\u3002"
  ],
  afterHoursNudge: [
    "\u5feb\u5230 18:30 \u4e86\uff0c\u5982\u679c\u8fd8\u5728\u52a8\u7535\u8111\uff0c\u5148\u4fdd\u5b58\u4e00\u4e0b\u3002",
    "\u4e0b\u73ed\u65f6\u95f4\u5230\u4e86\uff0c\u5148\u628a\u8fdb\u5ea6\u843d\u76d8\u518d\u7ee7\u7eed\u3002",
    "\u82e5\u8fd8\u5728\u6162\u6162\u6536\u5c3e\uff0c\u5148\u7559\u4e2a\u5c0f\u8bb0\u53f7\u3002"
  ]
};

export function getWorkRhythmCue(options: WorkRhythmOptions): WorkRhythmCue | undefined {
  if (!options.activeRecently || options.bubbleOpen) {
    return undefined;
  }

  const minutes = options.now.getHours() * 60 + options.now.getMinutes();
  const dateKey = formatLocalDate(options.now);

  if (minutes >= LUNCH_START_MINUTES && minutes < LUNCH_END_MINUTES) {
    return buildCue("lunchNudge", dateKey, options.seenCueKeys);
  }

  if (minutes >= AFTER_WORK_START_MINUTES && minutes <= LATE_END_MINUTES) {
    return buildCue("afterHoursNudge", dateKey, options.seenCueKeys);
  }

  return undefined;
}

function buildCue(
  kind: WorkRhythmCue["kind"],
  dateKey: string,
  seenCueKeys: ReadonlySet<string>
): WorkRhythmCue | undefined {
  const key = `${dateKey}:${kind}`;
  if (seenCueKeys.has(key)) {
    return undefined;
  }

  return {
    key,
    kind,
    bubble: pickReminder(kind, Date.now()),
    tone: kind === "afterHoursNudge" ? "working" : "info",
    followCursor: kind === "afterHoursNudge",
    followStatus: "waving"
  };
}

function pickReminder(kind: WorkRhythmCue["kind"], seed: number): string {
  const values = REMINDERS[kind];
  return values[Math.abs(Math.floor(seed)) % values.length];
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
