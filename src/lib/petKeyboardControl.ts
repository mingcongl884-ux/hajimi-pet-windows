import type { AnimationState } from "./atlas.js";
import type { MovementBounds, MovementSnapshot } from "./movement.js";

export type PetControlKey = "up" | "down" | "left" | "right" | "jump";

type Point = {
  x: number;
  y: number;
};

export type KeyboardControlStepOptions = {
  keys: ReadonlySet<PetControlKey>;
  current: Point;
  bounds: MovementBounds;
  deltaMs: number;
  speedPxPerSecond?: number;
  previousDirection?: 1 | -1;
};

const DEFAULT_KEYBOARD_SPEED_PX_PER_SECOND = 180;

export function normalizePetControlKey(key: string): PetControlKey | undefined {
  const lower = key.toLowerCase();
  if (lower === "w" || key === "ArrowUp") {
    return "up";
  }
  if (lower === "a" || key === "ArrowLeft") {
    return "left";
  }
  if (lower === "s" || key === "ArrowDown") {
    return "down";
  }
  if (lower === "d" || key === "ArrowRight") {
    return "right";
  }
  if (key === " " || key === "Spacebar" || key === "Space") {
    return "jump";
  }
  return undefined;
}

export function directionFromPetControlKeys(keys: ReadonlySet<PetControlKey>): Point {
  let x = 0;
  let y = 0;
  if (keys.has("left")) {
    x -= 1;
  }
  if (keys.has("right")) {
    x += 1;
  }
  if (keys.has("up")) {
    y -= 1;
  }
  if (keys.has("down")) {
    y += 1;
  }

  const length = Math.hypot(x, y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: x / length, y: y / length };
}

export function stepKeyboardControlledPet(options: KeyboardControlStepOptions): MovementSnapshot {
  const direction = directionFromPetControlKeys(options.keys);
  const previousDirection = options.previousDirection ?? 1;
  if (direction.x === 0 && direction.y === 0) {
    return {
      x: Math.round(clamp(options.current.x, options.bounds.minX, options.bounds.maxX)),
      y: Math.round(clamp(options.current.y, options.bounds.minY, options.bounds.maxY)),
      direction: previousDirection,
      animation: "idle"
    };
  }

  const distance = (options.speedPxPerSecond ?? DEFAULT_KEYBOARD_SPEED_PX_PER_SECOND) * (options.deltaMs / 1000);
  const x = clamp(options.current.x + direction.x * distance, options.bounds.minX, options.bounds.maxX);
  const y = clamp(options.current.y + direction.y * distance, options.bounds.minY, options.bounds.maxY);
  const facingDirection = direction.x < 0 ? -1 : direction.x > 0 ? 1 : previousDirection;
  return {
    x: Math.round(x),
    y: Math.round(y),
    direction: facingDirection,
    animation: runAnimationForDirection(facingDirection)
  };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const element = target as {
    isContentEditable?: boolean;
    tagName?: string;
  };
  if (element.isContentEditable) {
    return true;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName?.toUpperCase() ?? "");
}

function runAnimationForDirection(direction: 1 | -1): AnimationState {
  return direction === 1 ? "runRight" : "runLeft";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
