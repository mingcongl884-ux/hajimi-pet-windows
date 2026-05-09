export type AnimationState =
  | "idle"
  | "runRight"
  | "runLeft"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type ImageDimensions = {
  width: number;
  height: number;
};

export type AtlasFrame = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export const ANIMATION_ROWS: Record<AnimationState, number> = {
  idle: 0,
  runRight: 1,
  runLeft: 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8
};

const COLUMNS = 8;
const ROWS = 9;

export function getAtlasFrame(
  dimensions: ImageDimensions,
  state: AnimationState,
  frameIndex: number,
  frameCount = COLUMNS
): AtlasFrame {
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("Atlas dimensions must be positive.");
  }

  const sw = dimensions.width / COLUMNS;
  const sh = dimensions.height / ROWS;
  const safeFrameCount = Math.min(Math.max(Math.floor(frameCount), 1), COLUMNS);
  const column = ((frameIndex % safeFrameCount) + safeFrameCount) % safeFrameCount;

  return {
    sx: column * sw,
    sy: ANIMATION_ROWS[state] * sh,
    sw,
    sh
  };
}
