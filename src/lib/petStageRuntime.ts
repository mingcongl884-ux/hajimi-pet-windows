import type { AnimationState } from "./atlas.js";

export type NaturalMovementPauseOptions = {
  animationOverride?: AnimationState;
  dragging: boolean;
  playActive: boolean;
};

export function shouldPauseNaturalMovement(options: NaturalMovementPauseOptions) {
  return Boolean(options.animationOverride && !options.dragging && !options.playActive);
}
