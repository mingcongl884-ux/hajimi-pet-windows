import type { AnimationState } from "./atlas.js";
import { getPetVisibleRect, getPetWindowMovementBounds } from "./petWindowGeometry.js";

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
  jumpHeight?: number;
};

export type PetPlayStepOptions = {
  enabled: boolean;
  movementEnabled: boolean;
  chatOpen: boolean;
  bounds: PetPlayBounds[];
  screen: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  petScale?: number;
  tick: number;
};

const PLAY_STEP = 220;
const PLAY_DURATION_MS = 900;
const CHASE_PERIOD = 20;
const CHASE_PHASE_START = 2;
const CHASE_PHASE_END = 17;
const CHASE_GAP = 130;
const CHASE_RUNNER_STEP = 220;
const CHASE_CHASER_STEP = 195;
const CHASE_DURATION_MS = 1550;

export function planPetPlayStep(options: PetPlayStepOptions): PetPlayCommand[] {
  if (!options.enabled || !options.movementEnabled || options.chatOpen || options.bounds.length !== 2) {
    return [];
  }

  const [first, second] = options.bounds.slice().sort((left, right) => left.slot - right.slot);
  const petScale = options.petScale ?? 1;
  const firstCenter = visibleCenter(first, petScale);
  const secondCenter = visibleCenter(second, petScale);
  const distance = Math.hypot(secondCenter.x - firstCenter.x, secondCenter.y - firstCenter.y);
  const desiredGap = approachCenterGap(petScale);
  const closeEnoughDistance = desiredGap + 40;
  if (distance <= closeEnoughDistance && options.tick % 4 === 0) {
    return [
      commandFor(first, first.x, first.y, "jumping", options.screen, options.petScale),
      commandFor(second, second.x, second.y, "jumping", options.screen, options.petScale)
    ];
  }

  if (shouldChase(options.tick, distance, desiredGap)) {
    return planChaseStep(first, second, options);
  }

  return planApproachStep(first, second, options, desiredGap);
}

function planApproachStep(
  first: PetPlayBounds,
  second: PetPlayBounds,
  options: PetPlayStepOptions,
  desiredGap: number
): PetPlayCommand[] {
  const petScale = options.petScale ?? 1;
  const [left, right] = [first, second].slice().sort((a, b) => visibleCenter(a, petScale).x - visibleCenter(b, petScale).x);
  const leftCenter = visibleCenter(left, petScale);
  const rightCenter = visibleCenter(right, petScale);
  const midpointX = (leftCenter.x + rightCenter.x) / 2;
  const midpointY = (leftCenter.y + rightCenter.y) / 2;
  const leftTargetCenter = {
    x: Math.min(leftCenter.x + PLAY_STEP, midpointX - desiredGap / 2),
    y: midpointY + Math.sin(options.tick * 0.85) * 14
  };
  const rightTargetCenter = {
    x: Math.max(rightCenter.x - PLAY_STEP, midpointX + desiredGap / 2),
    y: midpointY + Math.cos(options.tick * 0.65) * 14
  };
  const leftTarget = windowPositionForCenter(leftTargetCenter, petScale);
  const rightTarget = windowPositionForCenter(rightTargetCenter, petScale);

  return [
    commandFor(left, leftTarget.x, leftTarget.y, animationToward(left.x, leftTarget.x), options.screen, options.petScale),
    commandFor(right, rightTarget.x, rightTarget.y, animationToward(right.x, rightTarget.x), options.screen, options.petScale)
  ].sort((a, b) => a.slot - b.slot);
}

function shouldChase(tick: number, distance: number, desiredGap: number): boolean {
  const phase = ((tick % CHASE_PERIOD) + CHASE_PERIOD) % CHASE_PERIOD;
  return distance >= desiredGap + 60 && phase >= CHASE_PHASE_START && phase <= CHASE_PHASE_END;
}

function planChaseStep(
  first: PetPlayBounds,
  second: PetPlayBounds,
  options: PetPlayStepOptions
): PetPlayCommand[] {
  const petScale = options.petScale ?? 1;
  const preferredRunner = preferredRunnerForChase(first, second, options.tick);
  const chase = chooseChasePair(preferredRunner, preferredRunner.slot === first.slot ? second : first, options);
  const { runner, chaser, direction } = chase;
  const runnerCenter = visibleCenter(runner, petScale);
  const chaserCenter = visibleCenter(chaser, petScale);
  const runnerTargetCenter = {
    x: runnerCenter.x + direction * CHASE_RUNNER_STEP,
    y: (runnerCenter.y + chaserCenter.y) / 2 + Math.sin(options.tick * 1.1) * 26
  };
  const runnerTarget = windowPositionForCenter(runnerTargetCenter, petScale);
  const runnerCommand = commandFor(runner, runnerTarget.x, runnerTarget.y, animationToward(runner.x, runnerTarget.x), options.screen, options.petScale, CHASE_DURATION_MS);
  const runnerTargetActualCenter = visibleCenter({ ...runner, x: runnerCommand.target.x, y: runnerCommand.target.y }, petScale);
  const chaserStepCenterX = chaserCenter.x + direction * CHASE_CHASER_STEP;
  const chaserFollowLimit = runnerTargetActualCenter.x - direction * CHASE_GAP;
  const chaserTargetCenter = {
    x: direction === 1
      ? Math.min(chaserStepCenterX, chaserFollowLimit)
      : Math.max(chaserStepCenterX, chaserFollowLimit),
    y: runnerTargetActualCenter.y + Math.cos(options.tick * 0.7) * 18
  };
  const chaserTarget = windowPositionForCenter(chaserTargetCenter, petScale);
  const animation: AnimationState = direction === 1 ? "runRight" : "runLeft";

  return [
    { ...runnerCommand, animation },
    commandFor(chaser, chaserTarget.x, chaserTarget.y, animation, options.screen, options.petScale, CHASE_DURATION_MS)
  ].sort((a, b) => a.slot - b.slot);
}

function preferredRunnerForChase(first: PetPlayBounds, second: PetPlayBounds, tick: number) {
  const chaseSession = Math.floor(tick / CHASE_PERIOD);
  return pseudoRandom01(chaseSession) > 0.5 ? first : second;
}

function chooseChasePair(
  preferredRunner: PetPlayBounds,
  preferredChaser: PetPlayBounds,
  options: PetPlayStepOptions
) {
  const preferredDirection = chaseAwayDirection(preferredRunner, preferredChaser, options.petScale);
  const minimumRunway = CHASE_RUNNER_STEP * 0.45;
  if (runwayFor(preferredRunner, preferredDirection, options.screen, options.petScale) >= minimumRunway) {
    return { runner: preferredRunner, chaser: preferredChaser, direction: preferredDirection };
  }

  const fallbackDirection = chaseAwayDirection(preferredChaser, preferredRunner, options.petScale);
  if (runwayFor(preferredChaser, fallbackDirection, options.screen, options.petScale) >= minimumRunway) {
    return { runner: preferredChaser, chaser: preferredRunner, direction: fallbackDirection };
  }

  const preferredRoom = runwayFor(preferredRunner, preferredDirection, options.screen, options.petScale);
  const fallbackRoom = runwayFor(preferredChaser, fallbackDirection, options.screen, options.petScale);
  return preferredRoom >= fallbackRoom
    ? { runner: preferredRunner, chaser: preferredChaser, direction: preferredDirection }
    : { runner: preferredChaser, chaser: preferredRunner, direction: fallbackDirection };
}

function chaseAwayDirection(runner: PetPlayBounds, chaser: PetPlayBounds, petScale = 1): 1 | -1 {
  return visibleCenter(runner, petScale).x >= visibleCenter(chaser, petScale).x ? 1 : -1;
}

function runwayFor(
  bounds: PetPlayBounds,
  direction: 1 | -1,
  screen: PetPlayStepOptions["screen"],
  petScale = 1
) {
  const movementBounds = movementBoundsFor(bounds, screen, petScale);
  return direction === 1 ? movementBounds.maxX - bounds.x : bounds.x - movementBounds.minX;
}

function approachCenterGap(petScale = 1) {
  const visible = getPetVisibleRect(petScale);
  return Math.max(100, Math.round(visible.width * 1.05));
}

function visibleCenter(bounds: PetPlayBounds, petScale = 1) {
  const visible = getPetVisibleRect(petScale);
  return {
    x: bounds.x + visible.left + visible.width / 2,
    y: bounds.y + visible.top + visible.height / 2
  };
}

function windowPositionForCenter(center: { x: number; y: number }, petScale = 1) {
  const visible = getPetVisibleRect(petScale);
  return {
    x: center.x - visible.left - visible.width / 2,
    y: center.y - visible.top - visible.height / 2
  };
}

function animationToward(fromX: number, targetX: number): AnimationState {
  return targetX >= fromX ? "runRight" : "runLeft";
}

function pseudoRandom01(seed: number) {
  const value = (Math.abs(Math.floor(seed)) * 37 + 17) % 100;
  return value / 100;
}

function commandFor(
  bounds: PetPlayBounds,
  x: number,
  y: number,
  animation: AnimationState,
  screen: { x?: number; y?: number; width: number; height: number },
  petScale = 1,
  durationMs = PLAY_DURATION_MS
): PetPlayCommand {
  const movementBounds = movementBoundsFor(bounds, screen, petScale);
  return {
    slot: bounds.slot,
    target: {
      x: clamp(Math.round(x), movementBounds.minX, movementBounds.maxX),
      y: clamp(Math.round(y), movementBounds.minY, movementBounds.maxY)
    },
    animation,
    durationMs
  };
}

function movementBoundsFor(
  bounds: PetPlayBounds,
  screen: { x?: number; y?: number; width: number; height: number },
  petScale = 1
) {
  return getPetWindowMovementBounds(screen, { width: bounds.width, height: bounds.height }, petScale);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
