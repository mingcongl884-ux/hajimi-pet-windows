import type { AnimationState } from "./atlas.js";

export type PetExperienceMood = "idle" | "happy" | "focused" | "concerned" | "lonely" | "calm";
export type PetMoodEvent =
  | "praised"
  | "taskCompleted"
  | "focusStarted"
  | "workTooLong"
  | "ignoredTooLong"
  | "quietRequested"
  | "userReturned";

export type PetMoodState = {
  mood: PetExperienceMood;
};

const MOOD_BUBBLES: Record<PetExperienceMood, string[]> = {
  idle: ["我在这里。"],
  happy: ["好耶，我开心了。", "收到夸夸，今天更有劲了。"],
  focused: ["我陪你专注一会儿。", "我会安静陪跑，到点再提醒你。"],
  concerned: ["休息一下眼睛吧，我就提醒这一次。", "肩膀放松，喝口水再继续。"],
  lonely: ["好久没说话了，哈基Mi有点委屈。", "我在这里等你哦，要不要摸一下再继续？"],
  calm: ["好的，我安静陪着你。", "你专注，我守着。"]
};

export function evolvePetMood(
  current: PetExperienceMood,
  event: PetMoodEvent
): PetMoodState {
  const mood = nextMoodForEvent(current, event);
  return { mood };
}

export function moodToAnimation(mood: PetExperienceMood): AnimationState {
  if (mood === "happy") {
    return "waving";
  }
  if (mood === "focused") {
    return "review";
  }
  if (mood === "concerned") {
    return "waiting";
  }
  if (mood === "lonely") {
    return "failed";
  }
  return "idle";
}

export function pickMoodBubble(mood: PetExperienceMood, seed = Date.now()): string {
  const candidates = MOOD_BUBBLES[mood];
  return candidates[Math.abs(Math.floor(seed)) % candidates.length] ?? "";
}

function nextMoodForEvent(current: PetExperienceMood, event: PetMoodEvent): PetExperienceMood {
  if (event === "praised" || event === "taskCompleted") {
    return "happy";
  }
  if (event === "focusStarted") {
    return "focused";
  }
  if (event === "workTooLong") {
    return "concerned";
  }
  if (event === "ignoredTooLong") {
    return "lonely";
  }
  if (event === "quietRequested") {
    return "calm";
  }
  if (event === "userReturned") {
    return current === "lonely" ? "happy" : "idle";
  }
  return current;
}
