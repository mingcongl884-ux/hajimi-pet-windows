import type { PetPlayCommand } from "./petPlay.js";
import { getPetVisibleRect } from "./petWindowGeometry.js";

export type PetEdge = "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "center";

export type PetMoveCommand = Omit<PetPlayCommand, "slot">;

type Point = {
  x: number;
  y: number;
};

type ScreenBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

type WindowBounds = Point & {
  width: number;
  height: number;
};

const EDGE_MARGIN = 0;
const MIN_MOVE_DURATION_MS = 1100;
const MAX_MOVE_DURATION_MS = 9000;
const PET_RUN_SPEED_PX_PER_SECOND = 150;
const PET_JUMP_DURATION_MS = 900;
const PET_JUMP_HEIGHT = 86;

export function resolveEdgePosition(edge: PetEdge, screen: ScreenBounds, windowBounds: WindowBounds, petScale = 1): Point {
  const visible = getPetVisibleRect(petScale);
  const originX = screen.x ?? 0;
  const originY = screen.y ?? 0;
  const left = originX + EDGE_MARGIN - visible.left;
  const right = originX + screen.width - visible.right - EDGE_MARGIN;
  const top = originY + EDGE_MARGIN - visible.top;
  const bottom = originY + screen.height - visible.bottom - EDGE_MARGIN;
  const centerX = originX + Math.round((screen.width - visible.width) / 2) - visible.left;
  const centerY = originY + Math.round((screen.height - visible.height) / 2) - visible.top;

  const positions: Record<PetEdge, Point> = {
    left: { x: left, y: centerY },
    right: { x: right, y: centerY },
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomLeft: { x: left, y: bottom },
    bottomRight: { x: right, y: bottom },
    center: { x: centerX, y: centerY }
  };
  return positions[edge];
}

export function resolveVisiblePetPosition(point: Point, petScale = 1): Point {
  const visible = getPetVisibleRect(petScale);
  return {
    x: Math.round(point.x - visible.left),
    y: Math.round(point.y - visible.top)
  };
}

export function buildPetMoveCommand(current: Point, target: Point): PetMoveCommand {
  const distance = Math.hypot(target.x - current.x, target.y - current.y);
  const durationMs = clamp(
    Math.round((distance / PET_RUN_SPEED_PX_PER_SECOND) * 1000),
    MIN_MOVE_DURATION_MS,
    MAX_MOVE_DURATION_MS
  );

  return {
    target: {
      x: Math.round(target.x),
      y: Math.round(target.y)
    },
    animation: target.x >= current.x ? "runRight" : "runLeft",
    durationMs
  };
}

export function buildPetJumpCommand(current: Point): PetMoveCommand {
  return {
    target: {
      x: Math.round(current.x),
      y: Math.round(current.y)
    },
    animation: "jumping",
    durationMs: PET_JUMP_DURATION_MS,
    jumpHeight: PET_JUMP_HEIGHT
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
