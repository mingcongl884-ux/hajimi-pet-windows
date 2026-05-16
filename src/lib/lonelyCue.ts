import type { AnimationState } from "./atlas.js";
import { choosePetGreeting } from "./petGreetings.js";

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
    bubble: choosePetGreeting("lonely", Math.floor(nowMs / 60000)),
    tone: "info",
    status: "failed"
  };
}
