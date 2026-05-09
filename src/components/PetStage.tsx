import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { getAtlasFrame, type AnimationState } from "../lib/atlas";
import { MovementController } from "../lib/movement";
import type { PetPlayCommand } from "../lib/petPlay";
import type { AppSettings } from "../../electron/settingsStore";
import type { InstalledPet, PetManifest } from "../lib/petTypes";
import type { PetAppState } from "../global";

type Props = {
  pet: InstalledPet;
  settings: AppSettings;
  screen: PetAppState["screen"];
  windowBounds: PetAppState["windowBounds"];
  chatOpen: boolean;
  animationOverride?: AnimationState;
  hoverActions?: PetHoverAction[];
  onClick(): void;
};

type PetHoverAction = {
  label: string;
  icon: ReactNode;
  onSelect(): void;
};

export default function PetStage({
  pet,
  settings,
  screen,
  windowBounds,
  chatOpen,
  animationOverride,
  hoverActions = [],
  onClick
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>();
  const frameRef = useRef(0);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean; lastScreenX: number; direction: 1 | -1 }>();
  const positionRef = useRef({ x: windowBounds.x, y: windowBounds.y });
  const movementRef = useRef<MovementController>();
  const animationRef = useRef<AnimationState>("idle");
  const playCommandRef = useRef<(PetPlayCommand & { until: number })>();

  useEffect(() => {
    positionRef.current = { x: windowBounds.x, y: windowBounds.y };
    movementRef.current = new MovementController({
      screen,
      pet: { width: windowBounds.width, height: windowBounds.height },
      rng: Math.random
    });
    movementRef.current.setPosition(windowBounds.x, windowBounds.y);
  }, [screen, windowBounds.height, windowBounds.width, windowBounds.x, windowBounds.y]);

  useEffect(() => {
    const image = new Image();
    image.src = pet.spritesheetUrl;
    image.onload = () => {
      imageRef.current = image;
      drawFrame(canvasRef.current, image, animationOverride ?? "idle", 0, frameCountFor(pet.manifest, "idle"));
    };
    image.onerror = () => {
      console.error(`Failed to load pet spritesheet: ${pet.spritesheetUrl}`);
    };
  }, [animationOverride, pet.manifest, pet.spritesheetUrl]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let movementAccumulator = 0;

    const loop = (now: number) => {
      const delta = now - last;
      last = now;
      frameRef.current += delta / 120;
      movementAccumulator += delta;

      const controller = movementRef.current;
      if (controller) {
        controller.setEnabled(settings.movementEnabled);
        controller.setIntensity(settings.movementIntensity);
        controller.setChatOpen(chatOpen);
        controller.setDragging(Boolean(dragRef.current), dragRef.current?.direction ?? 1);

        if (movementAccumulator >= 80) {
          const playCommand = playCommandRef.current;
          const playActive = Boolean(playCommand && now < playCommand.until && !dragRef.current && !chatOpen);
          const snapshot = playActive && playCommand
            ? followPlayCommand(playCommand, movementAccumulator)
            : controller.tick(movementAccumulator);
          movementAccumulator = 0;
          animationRef.current = snapshot.animation;
          positionRef.current = { x: snapshot.x, y: snapshot.y };
          if ((settings.movementEnabled || playActive) && !dragRef.current) {
            void window.petApp.setPetWindowBounds({ x: snapshot.x, y: snapshot.y });
          }
        }
      }

      if (imageRef.current) {
        const animation = animationOverride ?? animationRef.current;
        drawFrame(
          canvasRef.current,
          imageRef.current,
          animation,
          Math.floor(frameRef.current),
          frameCountFor(pet.manifest, animation)
        );
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animationOverride, chatOpen, pet.manifest, settings.movementEnabled, settings.movementIntensity]);

  useEffect(() => {
    return window.petApp.onPlayCommand((command) => {
      if (chatOpen) {
        playCommandRef.current = undefined;
        return;
      }
      playCommandRef.current = {
        ...command,
        until: performance.now() + command.durationMs
      };
    });
  }, [chatOpen]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      dx: event.screenX - positionRef.current.x,
      dy: event.screenY - positionRef.current.y,
      moved: false,
      lastScreenX: event.screenX,
      direction: 1
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      return;
    }
    const next = {
      x: event.screenX - dragRef.current.dx,
      y: event.screenY - dragRef.current.dy
    };
    const deltaX = event.screenX - dragRef.current.lastScreenX;
    dragRef.current.lastScreenX = event.screenX;
    if (deltaX !== 0) {
      dragRef.current.direction = deltaX > 0 ? 1 : -1;
    }
    dragRef.current.moved = true;
    positionRef.current = next;
    movementRef.current?.setPosition(next.x, next.y);
    movementRef.current?.setDragging(true, dragRef.current.direction);
    animationRef.current = dragRef.current.direction === 1 ? "runRight" : "runLeft";
    void window.petApp.setPetWindowBounds(next);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    const wasClick = !dragRef.current?.moved;
    dragRef.current = undefined;
    movementRef.current?.setDragging(false);
    if (wasClick) {
      onClick();
    }
  }

  function followPlayCommand(command: PetPlayCommand, deltaMs: number) {
    const current = positionRef.current;
    const distanceX = command.target.x - current.x;
    const distanceY = command.target.y - current.y;
    const distance = Math.hypot(distanceX, distanceY);
    const maxStep = 240 * (deltaMs / 1000);
    const progress = distance > 0 ? Math.min(1, maxStep / distance) : 1;
    const x = current.x + distanceX * progress;
    const y = current.y + distanceY * progress;
    movementRef.current?.setPosition(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      direction: distanceX >= 0 ? 1 as const : -1 as const,
      animation: command.animation
    };
  }

  return (
    <section
      className="pet-stage"
      style={{ "--pet-scale": String(settings.petScale) } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} width={192} height={208} className="pet-canvas" />
      {hoverActions.length > 0 && (
        <div className="pet-hover-actions" aria-label="宠物动作">
          {hoverActions.map((action) => (
            <button
              key={action.label}
              title={action.label}
              aria-label={action.label}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                action.onSelect();
              }}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function drawFrame(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  state: AnimationState,
  frameIndex: number,
  frameCount: number
) {
  if (!canvas || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const frame = getAtlasFrame({ width: image.naturalWidth, height: image.naturalHeight }, state, frameIndex, frameCount);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, canvas.width, canvas.height);
}

function frameCountFor(manifest: PetManifest, state: AnimationState) {
  const count = manifest.animationFrameCounts?.[state];
  return typeof count === "number" ? count : 8;
}
