import type { AnimationState } from "./atlas.js";

export type PetPlayBounds = {
  slot: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PetPlayCommand = {
  slot: number;
  target: {
    x: number;
    y: number;
  };
  animation: AnimationState;
  durationMs: number;
};

export type PetPlayStepOptions = {
  enabled: boolean;
  movementEnabled: boolean;
  chatOpen: boolean;
  bounds: PetPlayBounds[];
  screen: {
    width: number;
    height: number;
  };
  tick: number;
};

const PLAY_GAP = 140;
const PLAY_STEP = 150;
const PLAY_DURATION_MS = 900;

export function planPetPlayStep(options: PetPlayStepOptions): PetPlayCommand[] {
  if (!options.enabled || !options.movementEnabled || options.chatOpen || options.bounds.length !== 2) {
    return [];
  }

  const [first, second] = options.bounds.slice().sort((left, right) => left.slot - right.slot);
  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  if (distance <= 190 && options.tick % 4 === 0) {
    return [
      commandFor(first, first.x, first.y, "jumping", options.screen),
      commandFor(second, second.x, second.y, "jumping", options.screen)
    ];
  }

  const midpointX = (first.x + second.x) / 2;
  const midpointY = (first.y + second.y) / 2;
  const leftTargetX = Math.min(first.x + PLAY_STEP, midpointX - PLAY_GAP / 2);
  const rightTargetX = Math.max(second.x - PLAY_STEP, midpointX + PLAY_GAP / 2);
  const targetY = midpointY + Math.sin(options.tick * 0.85) * 18;

  return [
    commandFor(first, leftTargetX, targetY, "runRight", options.screen),
    commandFor(second, rightTargetX, targetY, "runLeft", options.screen)
  ];
}

function commandFor(
  bounds: PetPlayBounds,
  x: number,
  y: number,
  animation: AnimationState,
  screen: { width: number; height: number }
): PetPlayCommand {
  return {
    slot: bounds.slot,
    target: {
      x: clamp(Math.round(x), 0, Math.max(0, screen.width - bounds.width)),
      y: clamp(Math.round(y), 0, Math.max(0, screen.height - bounds.height))
    },
    animation,
    durationMs: PLAY_DURATION_MS
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
