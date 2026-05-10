export type PetAction =
  | { type: "say"; text: string }
  | { type: "jump" }
  | { type: "runAround"; seconds?: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "moveToEdge"; edge: PetEdge }
  | { type: "setMovement"; enabled: boolean; intensity?: PetMovementIntensity }
  | { type: "mood"; mood: PetMood }
  | { type: "openChat" }
  | { type: "stopMovement" };

type PetMood = "idle" | "happy" | "working" | "waiting" | "review" | "failed";
type PetEdge = "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "center";
type PetMovementIntensity = "calm" | "normal" | "lively";

const moods = new Set<PetMood>(["idle", "happy", "working", "waiting", "review", "failed"]);
const edges = new Set<PetEdge>(["left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight", "center"]);
const intensities = new Set<PetMovementIntensity>(["calm", "normal", "lively"]);

export function readPetAction(value: unknown): PetAction | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const typed = value as Record<string, unknown>;
  if (typed.type === "jump" || typed.type === "openChat" || typed.type === "stopMovement") {
    return { type: typed.type };
  }

  if (typed.type === "say" && typeof typed.text === "string" && typed.text.trim()) {
    return { type: "say", text: typed.text.trim().slice(0, 140) };
  }

  if (typed.type === "moveTo" && typeof typed.x === "number" && typeof typed.y === "number") {
    return { type: "moveTo", x: Math.round(typed.x), y: Math.round(typed.y) };
  }

  if (typed.type === "moveToEdge" && edges.has(typed.edge as PetEdge)) {
    return { type: "moveToEdge", edge: typed.edge as PetEdge };
  }

  if (typed.type === "setMovement" && typeof typed.enabled === "boolean") {
    if (typed.intensity === undefined) {
      return { type: "setMovement", enabled: typed.enabled };
    }
    if (intensities.has(typed.intensity as PetMovementIntensity)) {
      return {
        type: "setMovement",
        enabled: typed.enabled,
        intensity: typed.intensity as PetMovementIntensity
      };
    }
    return undefined;
  }

  if (typed.type === "runAround") {
    return {
      type: "runAround",
      seconds: typeof typed.seconds === "number" ? Math.max(1, Math.min(30, typed.seconds)) : undefined
    };
  }

  if (typed.type === "mood" && moods.has(typed.mood as PetMood)) {
    return { type: "mood", mood: typed.mood as PetMood };
  }

  return undefined;
}
