import type { AnimationState } from "./atlas.js";

export type NaturalMovementPauseOptions = {
  animationOverride?: AnimationState;
  dragging: boolean;
  keyboardControlActive?: boolean;
  playActive: boolean;
};

export function shouldPauseNaturalMovement(options: NaturalMovementPauseOptions) {
  return Boolean((options.animationOverride || options.keyboardControlActive) && !options.dragging && !options.playActive);
}
