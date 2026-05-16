import type { AnimationState } from "./atlas.js";

export type DesktopEventCue = {
  key: "offline" | "lowBattery" | "highMemory";
  bubble: string;
  status: AnimationState;
};

export type DesktopEventCueOptions = {
  online: boolean;
  battery?: {
    charging: boolean;
    level: number;
  };
  memory?: {
    totalBytes: number;
    freeBytes: number;
  };
  seenCueKeys: ReadonlySet<string>;
};

export function getDesktopEventCue(options: DesktopEventCueOptions): DesktopEventCue | undefined {
  if (!options.online && !options.seenCueKeys.has("offline")) {
    return {
      key: "offline",
      bubble: "网络好像断开了，我先帮你盯一下。",
      status: "waiting"
    };
  }

  if (
    options.battery &&
    !options.battery.charging &&
    options.battery.level <= 0.16 &&
    !options.seenCueKeys.has("lowBattery")
  ) {
    return {
      key: "lowBattery",
      bubble: "电量有点低啦，记得接上电源。",
      status: "waving"
    };
  }

  if (options.memory && memoryUsage(options.memory) >= 0.9 && !options.seenCueKeys.has("highMemory")) {
    return {
      key: "highMemory",
      bubble: "电脑内存有点紧，我建议先收一收不用的窗口。",
      status: "review"
    };
  }

  return undefined;
}

function memoryUsage(memory: { totalBytes: number; freeBytes: number }) {
  if (memory.totalBytes <= 0) {
    return 0;
  }
  return 1 - memory.freeBytes / memory.totalBytes;
}
