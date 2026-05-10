import { useEffect, useRef, type CSSProperties } from "react";
import { getAnimationFrameCount, getAtlasFrame, type AnimationState } from "../lib/atlas";
import { MovementController } from "../lib/movement";
import type { PetPlayCommand } from "../lib/petPlay";
import type { AppSettings } from "../../electron/settingsStore";
import type { InstalledPet, PetManifest } from "../lib/petTypes";
import type { PetAppState, ScreenPoint } from "../global";
import { getPetVisibleRect, getPetWindowMovementBounds } from "../lib/petWindowGeometry";
import { shouldPauseNaturalMovement } from "../lib/petStageRuntime";

type Props = {
  pet: InstalledPet;
  settings: AppSettings;
  screen: PetAppState["screen"];
  windowBounds: PetAppState["windowBounds"];
  chatOpen: boolean;
  animationOverride?: AnimationState;
  onClick(): void;
};

type RuntimePlayCommand = PetPlayCommand & {
  from: {
    x: number;
    y: number;
  };
  startedAt: number;
  until: number;
};

const HOVER_REACTION_INTERVAL_MS = 900;
const HOVER_CURSOR_POLL_MS = 120;
const HOVER_CURSOR_STALE_MS = 500;
const HOVER_REACTIONS: AnimationState[] = ["waving", "jumping"];

export default function PetStage({
  pet,
  settings,
  screen,
  windowBounds,
  chatOpen,
  animationOverride,
  onClick
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>();
  const frameRef = useRef(0);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean; lastScreenX: number; direction: 1 | -1 }>();
  const positionRef = useRef({ x: windowBounds.x, y: windowBounds.y });
  const movementRef = useRef<MovementController>();
  const animationRef = useRef<AnimationState>("idle");
  const playCommandRef = useRef<RuntimePlayCommand>();
  const hoverReactionActiveRef = useRef(false);
  const hoverReactionNextAtRef = useRef(0);
  const hoverPointerRef = useRef<{ clientX: number; clientY: number; screenX: number; screenY: number }>();
  const hoverCursorRef = useRef<ScreenPoint & { at: number }>();
  const hoverCursorPollPendingRef = useRef(false);
  const hoverReactionRef = useRef<AnimationState>("waving");

  useEffect(() => {
    positionRef.current = { x: windowBounds.x, y: windowBounds.y };
    movementRef.current = new MovementController({
      screen,
      pet: { width: windowBounds.width, height: windowBounds.height },
      bounds: getPetWindowMovementBounds(screen, { width: windowBounds.width, height: windowBounds.height }, settings.petScale),
      rng: Math.random
    });
    movementRef.current.setPosition(windowBounds.x, windowBounds.y);
  }, [screen, settings.petScale, windowBounds.height, windowBounds.width, windowBounds.x, windowBounds.y]);

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
        controller.setIntensity(settings.movementIntensity);
        controller.setChatOpen(chatOpen);
        controller.setDragging(Boolean(dragRef.current), dragRef.current?.direction ?? 1);

        if (movementAccumulator >= 80) {
          const playCommand = playCommandRef.current;
          const playActive = Boolean(playCommand && !dragRef.current);
          const naturalMovementPaused = shouldPauseNaturalMovement({
            animationOverride,
            dragging: Boolean(dragRef.current),
            playActive
          });
          controller.setEnabled(settings.movementEnabled && !naturalMovementPaused);
          const snapshot = playActive && playCommand
            ? followPlayCommand(playCommand, now)
            : controller.tick(movementAccumulator);
          movementAccumulator = 0;
          animationRef.current = snapshot.animation;
          positionRef.current = { x: snapshot.x, y: snapshot.y };
          if (((settings.movementEnabled && !naturalMovementPaused) || playActive) && !dragRef.current) {
            void window.petApp.setPetWindowBounds({ x: snapshot.x, y: snapshot.y });
          }
          if (playCommand && now >= playCommand.until) {
            playCommandRef.current = undefined;
          }
        }
      }

      if (imageRef.current) {
        const hoverIsReal = hoverReactionActiveRef.current && isPointerStillOverPet();
        if (hoverReactionActiveRef.current && !hoverIsReal) {
          clearHoverReaction();
        }
        const canHoverReact = hoverIsReal && !chatOpen && !playCommandRef.current && !dragRef.current && !animationOverride && animationRef.current === "idle";
        if (canHoverReact && now >= hoverReactionNextAtRef.current) {
          hoverReactionRef.current = pickHoverReaction();
          hoverReactionNextAtRef.current = now + HOVER_REACTION_INTERVAL_MS;
        }
        const animation = playCommandRef.current || dragRef.current ? animationRef.current : canHoverReact ? hoverReactionRef.current : animationOverride ?? animationRef.current;
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
    if (chatOpen) {
      clearHoverReaction();
    }
  }, [chatOpen]);

  useEffect(() => {
    if (!settings.movementEnabled) {
      playCommandRef.current = undefined;
      animationRef.current = "idle";
      movementRef.current?.setEnabled(false);
      if (imageRef.current) {
        drawFrame(canvasRef.current, imageRef.current, "idle", Math.floor(frameRef.current), frameCountFor(pet.manifest, "idle"));
      }
    }
  }, [pet.manifest, settings.movementEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!hoverReactionActiveRef.current) {
        return;
      }
      if (chatOpen) {
        clearHoverReaction();
        return;
      }
      refreshHoverCursor();
    }, HOVER_CURSOR_POLL_MS);

    return () => window.clearInterval(timer);
  }, [chatOpen, settings.petScale]);

  useEffect(() => {
    window.addEventListener("mouseleave", clearHoverReaction);
    window.addEventListener("blur", clearHoverReaction);
    document.addEventListener("visibilitychange", clearHoverReaction);
    return () => {
      window.removeEventListener("mouseleave", clearHoverReaction);
      window.removeEventListener("blur", clearHoverReaction);
      document.removeEventListener("visibilitychange", clearHoverReaction);
    };
  }, []);

  useEffect(() => {
    return window.petApp.onPlayCommand((command) => {
      const now = performance.now();
      const from = { ...positionRef.current };
      playCommandRef.current = {
        ...command,
        target: command.jumpHeight ? from : command.target,
        from,
        startedAt: now,
        until: now + command.durationMs
      };
    });
  }, []);

  function handlePetPointerEnter(event: React.PointerEvent<HTMLCanvasElement>) {
    trackHoverPointer(event);
    if (chatOpen) {
      clearHoverReaction();
      return;
    }
    hoverReactionActiveRef.current = true;
    hoverReactionRef.current = pickHoverReaction();
    hoverReactionNextAtRef.current = performance.now() + HOVER_REACTION_INTERVAL_MS;
    refreshHoverCursor();
  }

  function handlePetPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    trackHoverPointer(event);
    if (!hoverReactionActiveRef.current && !chatOpen) {
      hoverReactionActiveRef.current = true;
      hoverReactionRef.current = pickHoverReaction();
      hoverReactionNextAtRef.current = performance.now() + HOVER_REACTION_INTERVAL_MS;
    }
  }

  function handlePetPointerLeave() {
    clearHoverReaction();
  }

  function clearHoverReaction() {
    hoverReactionActiveRef.current = false;
    hoverReactionNextAtRef.current = 0;
    hoverPointerRef.current = undefined;
    hoverCursorRef.current = undefined;
  }

  function trackHoverPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const now = performance.now();
    hoverPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY
    };
    hoverCursorRef.current = {
      x: event.screenX,
      y: event.screenY,
      at: now
    };
  }

  function isPointerStillOverPet() {
    const cursor = hoverCursorRef.current;
    if (!cursor) {
      return false;
    }

    if (performance.now() - cursor.at > HOVER_CURSOR_STALE_MS) {
      refreshHoverCursor();
      return false;
    }

    return isCursorOverVisiblePet(cursor);
  }

  function isCursorOverVisiblePet(point: ScreenPoint) {
    const visibleRect = getPetVisibleRect(settings.petScale);
    return (
      point.x >= positionRef.current.x + visibleRect.left &&
      point.x <= positionRef.current.x + visibleRect.right &&
      point.y >= positionRef.current.y + visibleRect.top &&
      point.y <= positionRef.current.y + visibleRect.bottom
    );
  }

  function refreshHoverCursor() {
    if (hoverCursorPollPendingRef.current) {
      return;
    }

    hoverCursorPollPendingRef.current = true;
    void window.petApp.getCursorScreenPoint()
      .then((point) => {
        hoverCursorRef.current = { ...point, at: performance.now() };
        if (hoverReactionActiveRef.current && !isCursorOverVisiblePet(point)) {
          clearHoverReaction();
        }
      })
      .catch(() => clearHoverReaction())
      .finally(() => {
        hoverCursorPollPendingRef.current = false;
      });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    clearHoverReaction();
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

  function followPlayCommand(playCommand: RuntimePlayCommand, now: number) {
    const linearProgress = playCommand.durationMs > 0
      ? Math.min(1, Math.max(0, (now - playCommand.startedAt) / playCommand.durationMs))
      : 1;
    const x = playCommand.from.x + (playCommand.target.x - playCommand.from.x) * linearProgress;
    const jumpOffset = (playCommand.jumpHeight ?? 0) * Math.sin(linearProgress * Math.PI);
    const y = playCommand.from.y + (playCommand.target.y - playCommand.from.y) * linearProgress - jumpOffset;
    movementRef.current?.setPosition(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      direction: playCommand.target.x >= playCommand.from.x ? 1 as const : -1 as const,
      animation: playCommand.animation
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
      <canvas
        ref={canvasRef}
        width={192}
        height={208}
        className="pet-canvas"
        onPointerEnter={handlePetPointerEnter}
        onPointerMove={handlePetPointerMove}
        onPointerLeave={handlePetPointerLeave}
        onPointerCancel={handlePetPointerLeave}
      />
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
  return getAnimationFrameCount(manifest.animationFrameCounts, state);
}

function pickHoverReaction() {
  return HOVER_REACTIONS[Math.floor(Math.random() * HOVER_REACTIONS.length)] ?? "waving";
}
