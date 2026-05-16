import { choosePetGreeting } from "./petGreetings.js";

export type GreetingSlotId = "morning" | "lunch" | "afterWork";

export type GreetingSlot = {
  id: GreetingSlotId;
  key: string;
  label: string;
};

type SlotConfig = {
  id: GreetingSlotId;
  label: string;
  minuteStart: number;
  minuteEnd: number;
};

const SLOTS: SlotConfig[] = [
  { id: "morning", label: "09:40 上班问候", minuteStart: 9 * 60 + 35, minuteEnd: 9 * 60 + 50 },
  { id: "lunch", label: "12:00 午间提醒", minuteStart: 12 * 60, minuteEnd: 12 * 60 + 15 },
  { id: "afterWork", label: "18:20 下班提醒", minuteStart: 18 * 60 + 15, minuteEnd: 18 * 60 + 35 }
];

export function getDueGreetingSlot(now: Date, sentKeys: string[]): GreetingSlot | undefined {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const dateKey = formatLocalDate(now);
  const slot = SLOTS.find((candidate) => minutes >= candidate.minuteStart && minutes <= candidate.minuteEnd);
  if (!slot) {
    return undefined;
  }

  const key = `${dateKey}:${slot.id}`;
  return sentKeys.includes(key) ? undefined : { id: slot.id, key, label: slot.label };
}

export function chooseLocalGreeting(slotId: GreetingSlotId, seed = Date.now()): string {
  return choosePetGreeting(slotId, seed);
}

export function buildHeartbeatPrompt(slotId: GreetingSlotId): string {
  const timeHint = slotId === "morning" ? "09:40" : slotId === "lunch" ? "12:00" : "18:20";
  return [
    "This is a proactive desktop-pet heartbeat turn.",
    `Current reminder slot: ${timeHint}.`,
    "Write one short, warm Chinese bubble message for the user.",
    "During work hours you may remind them to relax their eyes, drink water, stretch, or gently wrap up.",
    "If you truly have nothing useful to say, reply exactly HEARTBEAT_OK.",
    "Do not mention that you are a model or heartbeat."
  ].join("\n");
}

export function shouldCollapseToBubble({
  busy,
  chatOpen,
  bubbleOpen,
  idleMs,
  thresholdMs
}: {
  busy: boolean;
  chatOpen: boolean;
  bubbleOpen: boolean;
  idleMs: number;
  thresholdMs: number;
}): boolean {
  return busy && chatOpen && !bubbleOpen && idleMs >= thresholdMs;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
