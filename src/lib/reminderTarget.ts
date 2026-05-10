import type { PetAppState } from "../global.js";

export function resolveReminderTarget(
  cursorX: number,
  cursorY: number,
  screen: PetAppState["screen"],
  windowBounds: PetAppState["windowBounds"]
) {
  const originX = screen.x ?? 0;
  const originY = screen.y ?? 0;
  const maxX = originX + Math.max(0, screen.width - windowBounds.width);
  const maxY = originY + Math.max(0, screen.height - windowBounds.height);
  const offsetX = cursorX < originX + screen.width / 2 ? 72 : -(windowBounds.width + 72);
  const offsetY = 28;

  return {
    x: Math.min(Math.max(originX, Math.round(cursorX + offsetX)), maxX),
    y: Math.min(Math.max(originY, Math.round(cursorY + offsetY)), maxY)
  };
}
