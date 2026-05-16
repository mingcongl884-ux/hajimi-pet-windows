import type { AnimationState } from "./atlas.js";
import { choosePetGreeting } from "./petGreetings.js";

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
  return choosePetGreeting(kind, seed);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
