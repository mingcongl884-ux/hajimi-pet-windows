export type RectSize = {
  width: number;
  height: number;
};

export type ScreenRect = RectSize & {
  x?: number;
  y?: number;
};

export type Point = {
  x: number;
  y: number;
};

export type PetVisibleRect = RectSize & {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PetWindowMovementBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export const PET_WINDOW_SIZE: RectSize = { width: 620, height: 520 };

const PET_STAGE = {
  anchorX: 495,
  width: 250,
  height: 270,
  bottom: 12,
  naturalWidth: 192,
  naturalHeight: 208,
  maxCanvasWidth: 250
};

export function getPetVisibleRect(scale: number): PetVisibleRect {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0.5;
  const canvasWidth = Math.min(PET_STAGE.maxCanvasWidth, PET_STAGE.naturalWidth * safeScale);
  const canvasHeight = canvasWidth * (PET_STAGE.naturalHeight / PET_STAGE.naturalWidth);
  const stageLeft = PET_STAGE.anchorX - PET_STAGE.width / 2;
  const stageTop = PET_WINDOW_SIZE.height - PET_STAGE.bottom - PET_STAGE.height;
  const left = Math.round(stageLeft + (PET_STAGE.width - canvasWidth) / 2);
  const top = Math.round(stageTop + PET_STAGE.height - canvasHeight);
  const width = Math.round(canvasWidth);
  const height = Math.round(canvasHeight);

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

export function getPetWindowMovementBounds(
  screen: ScreenRect,
  windowSize: RectSize,
  scale: number
): PetWindowMovementBounds {
  const visible = getPetVisibleRect(scale);
  const originX = screen.x ?? 0;
  const originY = screen.y ?? 0;
  return {
    minX: originX - visible.left,
    maxX: originX + screen.width - visible.right,
    minY: originY - visible.top,
    maxY: originY + screen.height - visible.bottom
  };
}

export function clampPetWindowPosition(
  position: Point,
  screen: ScreenRect,
  windowSize: RectSize,
  scale: number
): Point {
  const bounds = getPetWindowMovementBounds(screen, windowSize, scale);
  return {
    x: clamp(Math.round(position.x), bounds.minX, bounds.maxX),
    y: clamp(Math.round(position.y), bounds.minY, bounds.maxY)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
