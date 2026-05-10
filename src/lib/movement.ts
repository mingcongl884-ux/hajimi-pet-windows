import type { AnimationState } from "./atlas.js";

export type MovementIntensity = "calm" | "normal" | "lively";

export type MovementControllerOptions = {
  screen: { width: number; height: number };
  pet: { width: number; height: number };
  bounds?: MovementBounds;
  rng?: () => number;
};

export type MovementBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type MovementSnapshot = {
  x: number;
  y: number;
  direction: 1 | -1;
  animation: AnimationState;
};

type Mode = "idle" | "walk" | "run" | "express" | "jump";

const INTENSITY_SPEED: Record<MovementIntensity, { walk: number; run: number; idleMs: number }> = {
  calm: { walk: 28, run: 72, idleMs: 2200 },
  normal: { walk: 44, run: 108, idleMs: 1500 },
  lively: { walk: 64, run: 150, idleMs: 900 }
};

const TWO_PI = Math.PI * 2;

export class MovementController {
  private readonly rng: () => number;
  private screen: { width: number; height: number };
  private pet: { width: number; height: number };
  private bounds?: MovementBounds;
  private enabled = false;
  private dragging = false;
  private chatOpen = false;
  private intensity: MovementIntensity = "normal";
  private mode: Mode = "idle";
  private modeRemainingMs = 0;
  private x = 0;
  private y = 0;
  private headingX = 1;
  private headingY = 0;
  private direction: 1 | -1 = 1;
  private animation: AnimationState = "idle";
  private jumpElapsedMs = 0;
  private jumpDurationMs = 800;
  private jumpBaseY = 0;
  private jumpAmplitude = 80;

  constructor(options: MovementControllerOptions) {
    this.screen = options.screen;
    this.pet = options.pet;
    this.bounds = options.bounds;
    this.rng = options.rng ?? Math.random;
    this.y = Math.max(0, this.screen.height - this.pet.height);
    this.pickNextMode();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.mode = "idle";
      this.animation = "idle";
    }
  }

  setDragging(dragging: boolean, direction: 1 | -1 = this.direction): void {
    this.dragging = dragging;
    if (dragging) {
      this.direction = direction;
      this.animation = direction === 1 ? "runRight" : "runLeft";
    }
  }

  setChatOpen(open: boolean): void {
    this.chatOpen = open;
  }

  setIntensity(intensity: MovementIntensity): void {
    this.intensity = intensity;
  }

  setScreen(screen: { width: number; height: number }): void {
    this.screen = screen;
    this.clampPosition();
  }

  setBounds(bounds: MovementBounds): void {
    this.bounds = bounds;
    this.clampPosition();
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clampPosition();
    if (this.mode === "jump") {
      this.jumpBaseY = this.y;
    }
  }

  tick(deltaMs: number): MovementSnapshot {
    if (!this.enabled || this.dragging) {
      return this.snapshot();
    }

    if (this.mode === "jump") {
      this.modeRemainingMs -= deltaMs;
      this.tickJump(deltaMs);
      if (this.modeRemainingMs <= 0) {
        this.y = this.jumpBaseY;
        this.clampPosition();
        this.pickNextMode();
      }
      return this.snapshot();
    }

    this.modeRemainingMs -= deltaMs;
    if (this.modeRemainingMs <= 0) {
      this.pickNextMode();
    }

    if (this.mode === "idle") {
      this.animation = "idle";
      return this.snapshot();
    }

    if (this.mode === "express") {
      this.animation = this.rng() > 0.5 ? "waving" : "jumping";
      return this.snapshot();
    }

    const speed = this.mode === "run" ? this.speed().run : this.speed().walk;
    const chatMultiplier = this.chatOpen ? 0.35 : 1;
    this.x += this.headingX * speed * chatMultiplier * (deltaMs / 1000);
    this.y += this.headingY * speed * chatMultiplier * (deltaMs / 1000);
    this.bounceWithinBounds();
    this.direction = this.headingX >= 0 ? 1 : -1;
    this.animation = this.direction === 1 ? "runRight" : "runLeft";

    return this.snapshot();
  }

  snapshot(): MovementSnapshot {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      direction: this.direction,
      animation: this.animation
    };
  }

  private pickNextMode(): void {
    const roll = this.rng();
    if (roll < 0.25) {
      this.mode = "idle";
      this.modeRemainingMs = this.speed().idleMs + this.rng() * 900;
      this.animation = "idle";
      return;
    }

    if (roll > 0.9) {
      this.mode = "jump";
      this.modeRemainingMs = 760 + this.rng() * 380;
      this.jumpElapsedMs = 0;
      this.jumpDurationMs = this.modeRemainingMs;
      this.jumpBaseY = this.y;
      this.jumpAmplitude = Math.min(120, Math.max(42, this.pet.height * (0.25 + this.rng() * 0.3)));
      this.animation = "jumping";
      return;
    }

    if (roll > 0.82) {
      this.mode = "express";
      this.modeRemainingMs = 700 + this.rng() * 500;
      this.animation = "waving";
      return;
    }

    this.mode = roll > 0.66 ? "run" : "walk";
    this.modeRemainingMs = 1200 + this.rng() * 2600;
    this.pickHeading();
    this.direction = this.headingX >= 0 ? 1 : -1;
    this.animation = this.direction === 1 ? "runRight" : "runLeft";
  }

  private pickHeading(): void {
    const angle = this.rng() * TWO_PI;
    this.headingX = Math.cos(angle);
    this.headingY = Math.sin(angle);

    if (Math.abs(this.headingX) < 0.18) {
      this.headingX = this.headingX < 0 ? -0.18 : 0.18;
    }
    if (Math.abs(this.headingY) < 0.18) {
      this.headingY = this.headingY < 0 ? -0.18 : 0.18;
    }

    const length = Math.hypot(this.headingX, this.headingY);
    this.headingX /= length;
    this.headingY /= length;
  }

  private tickJump(deltaMs: number): void {
    this.jumpElapsedMs += deltaMs;
    const progress = Math.min(1, this.jumpElapsedMs / this.jumpDurationMs);
    this.y = this.jumpBaseY - Math.sin(progress * Math.PI) * this.jumpAmplitude;
    this.animation = "jumping";
    this.clampPosition();
  }

  private bounceWithinBounds(): void {
    const minX = this.minX();
    const maxX = this.maxX();
    const minY = this.minY();
    const maxY = this.maxY();

    if (this.x <= minX) {
      this.x = minX;
      this.headingX = Math.abs(this.headingX);
    } else if (this.x >= maxX) {
      this.x = maxX;
      this.headingX = -Math.abs(this.headingX);
    }

    if (this.y <= minY) {
      this.y = minY;
      this.headingY = Math.abs(this.headingY);
    } else if (this.y >= maxY) {
      this.y = maxY;
      this.headingY = -Math.abs(this.headingY);
    }
  }

  private speed() {
    return INTENSITY_SPEED[this.intensity];
  }

  private minX(): number {
    return this.bounds?.minX ?? 0;
  }

  private maxX(): number {
    return this.bounds?.maxX ?? Math.max(0, this.screen.width - this.pet.width);
  }

  private minY(): number {
    return this.bounds?.minY ?? 0;
  }

  private maxY(): number {
    return this.bounds?.maxY ?? Math.max(0, this.screen.height - this.pet.height);
  }

  private clampPosition(): void {
    this.x = Math.min(Math.max(this.minX(), this.x), this.maxX());
    this.y = Math.min(Math.max(this.minY(), this.y), this.maxY());
  }
}
