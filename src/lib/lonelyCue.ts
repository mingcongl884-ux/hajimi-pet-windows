import type { AnimationState } from "./atlas.js";

export type LonelyCue = {
  bubble: string;
  tone: "info";
  status: AnimationState;
};

type LonelyCueOptions = {
  idleMs: number;
  busy: boolean;
  chatOpen: boolean;
  bubbleOpen: boolean;
  movementEnabled: boolean;
  now: Date;
  lastCueAt: number;
};

const LONELY_IDLE_MS = 45 * 60 * 1000;
const LONELY_COOLDOWN_MS = 90 * 60 * 1000;
const LONELY_MESSAGES = [
  "还在吗？哈基Mi有点想你了。",
  "好久没人理我了，我先在这里等你一下。",
  "我有点委屈，但还是会乖乖等你回来。"
];

export function getLonelyCue(options: LonelyCueOptions): LonelyCue | undefined {
  const nowMs = options.now.getTime();
  if (
    options.busy ||
    options.chatOpen ||
    options.bubbleOpen ||
    options.movementEnabled ||
    options.idleMs < LONELY_IDLE_MS ||
    (options.lastCueAt > 0 && nowMs - options.lastCueAt < LONELY_COOLDOWN_MS)
  ) {
    return undefined;
  }

  return {
    bubble: pickLonelyMessage(nowMs),
    tone: "info",
    status: "failed"
  };
}

function pickLonelyMessage(seed: number) {
  return LONELY_MESSAGES[Math.abs(Math.floor(seed / 60000)) % LONELY_MESSAGES.length];
}
