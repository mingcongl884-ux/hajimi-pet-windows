import { useEffect, useRef } from "react";
import type { MutableRefObject, SetStateAction, Dispatch } from "react";
import type { PetAppState } from "../global";
import type { AnimationState } from "../lib/atlas";
import { choosePetGreeting } from "../lib/petGreetings";
import { getDesktopEventCue } from "../lib/desktopEventCues";
import { getLonelyCue } from "../lib/lonelyCue";
import { getWorkRhythmCue } from "../lib/workRhythm";
import { buildPetMoveCommand } from "../lib/petMotion";
import { resolveReminderTarget } from "../lib/reminderTarget";
import type { PetMoodEvent } from "../lib/petMood";
import type { AppMode, BubbleState } from "../types/petUi";

type RuntimeCallbacks = {
  setBubble: Dispatch<SetStateAction<BubbleState | undefined>>;
  setChatOpen: Dispatch<SetStateAction<boolean>>;
  setTimedPetStatus: (nextStatus: AnimationState, durationMs: number) => void;
  showBubble: (text: string, tone: BubbleState["tone"]) => void;
  updatePetMood: (event: PetMoodEvent) => void;
  runHeartbeatCheck: () => Promise<void>;
  runNetworkCheck: () => Promise<void>;
};

type UsePetRuntimeEffectsOptions = {
  mode: AppMode;
  state: PetAppState | undefined;
  bubble: BubbleState | undefined;
  chatOpen: boolean;
  agentMode: boolean;
  busyRef: MutableRefObject<boolean>;
  lastInteractionRef: MutableRefObject<number>;
  seenWorkCueKeysRef: MutableRefObject<Set<string>>;
  seenDesktopCueKeysRef: MutableRefObject<Set<string>>;
  cursorPositionRef: MutableRefObject<{ x: number; y: number; at: number }>;
  lastLonelyCueAtRef: MutableRefObject<number>;
  networkCheckStartedRef: MutableRefObject<boolean>;
  petActionStatusTimeoutRef: MutableRefObject<number | undefined>;
  focusCompanionTimerRef: MutableRefObject<number | undefined>;
  runtime: RuntimeCallbacks;
};

const BUBBLE_AUTO_HIDE_MS = 15000;

export function usePetRuntimeEffects(options: UsePetRuntimeEffectsOptions) {
  const runtimeRef = useRef(options.runtime);

  useEffect(() => {
    runtimeRef.current = options.runtime;
  }, [options.runtime]);

  useEffect(() => {
    if (!options.bubble) {
      return;
    }

    const timer = window.setTimeout(() => runtimeRef.current.setBubble(undefined), BUBBLE_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [options.bubble]);

  useEffect(() => {
    if (!options.state || options.mode === "manager") {
      return;
    }

    const timer = window.setInterval(() => {
      const settings = options.state?.settings;
      if (!settings) {
        return;
      }

      if (settings.heartbeat.collapseToBubbleEnabled && shouldCollapseToBubble({
        busy: options.busyRef.current,
        chatOpen: options.chatOpen,
        bubbleOpen: Boolean(options.bubble),
        idleMs: Date.now() - options.lastInteractionRef.current,
        thresholdMs: settings.heartbeat.bubbleIdleSeconds * 1000
      })) {
        runtimeRef.current.setChatOpen(false);
        runtimeRef.current.setBubble({
          text: options.agentMode ? "哈基Mi正在办公，完成后会把结果放在这里。" : "哈基Mi正在想，等会儿用气泡告诉你。",
          tone: "working"
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [options.agentMode, options.bubble, options.chatOpen, options.mode, options.state]);

  useEffect(() => {
    if (!options.state || options.mode === "manager" || !options.state.settings.heartbeat.enabled) {
      return;
    }

    const triggerCue = (cue: NonNullable<ReturnType<typeof getWorkRhythmCue>>) => {
      options.seenWorkCueKeysRef.current.add(cue.key);
      runtimeRef.current.setChatOpen(false);
      if (cue.followCursor) {
        const cursor = options.cursorPositionRef.current;
        const cursorIsFresh = cursor.at > 0 && Date.now() - cursor.at <= 5000;
        if (cursorIsFresh) {
          void window.petApp.getPetWindowBounds().then((currentBounds) => {
            const command = buildPetMoveCommand(
              { x: currentBounds.x, y: currentBounds.y },
              resolveReminderTarget(cursor.x, cursor.y, options.state?.screen, currentBounds)
            );
            void window.petApp.movePetTo(command);
            runtimeRef.current.setTimedPetStatus(cue.followStatus, command.durationMs + 1000);
          });
        } else {
          runtimeRef.current.setTimedPetStatus(cue.followStatus, 1000);
        }
      } else {
        runtimeRef.current.setTimedPetStatus(cue.followStatus, 1000);
      }
      runtimeRef.current.showBubble(cue.bubble, cue.tone);
    };

    const tick = () => {
      const cue = getWorkRhythmCue({
        now: new Date(),
        activeRecently: options.busyRef.current || Date.now() - options.lastInteractionRef.current <= 120_000,
        bubbleOpen: Boolean(options.bubble),
        seenCueKeys: options.seenWorkCueKeysRef.current
      });
      if (cue) {
        triggerCue(cue);
      }
    };

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [options.bubble, options.mode, options.state]);

  useEffect(() => {
    if (!options.state || options.mode === "manager") {
      return;
    }

    if (!import.meta.env.DEV) {
      return;
    }

    const triggerLonelyCue = () => {
      runtimeRef.current.setChatOpen(false);
      runtimeRef.current.setTimedPetStatus("failed", 8000);
      runtimeRef.current.showBubble(choosePetGreeting("lonely"), "info");
    };

    window.addEventListener("hajimi:trigger-lonely-cue", triggerLonelyCue);
    return () => window.removeEventListener("hajimi:trigger-lonely-cue", triggerLonelyCue);
  }, [options.mode, options.state]);

  useEffect(() => {
    if (!options.state || options.mode === "manager") {
      return;
    }

    const tick = () => {
      const cue = getLonelyCue({
        idleMs: Date.now() - options.lastInteractionRef.current,
        busy: options.busyRef.current,
        chatOpen: options.chatOpen,
        bubbleOpen: Boolean(options.bubble),
        movementEnabled: options.state?.settings.movementEnabled ?? false,
        now: new Date(),
        lastCueAt: options.lastLonelyCueAtRef.current
      });
      if (!cue) {
        return;
      }
      options.lastLonelyCueAtRef.current = Date.now();
      runtimeRef.current.setChatOpen(false);
      runtimeRef.current.setTimedPetStatus(cue.status, 1600);
      runtimeRef.current.showBubble(cue.bubble, cue.tone);
    };

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [options.bubble, options.chatOpen, options.mode, options.state]);

  useEffect(() => {
    if (!options.state || options.mode === "manager") {
      return;
    }

    const readBatteryStatus = async () => {
      const navigatorWithBattery = navigator as Navigator & {
        getBattery?: () => Promise<{ charging: boolean; level: number }>;
      };
      return navigatorWithBattery.getBattery?.();
    };

    const tick = async () => {
      try {
        const [battery, systemStatus] = await Promise.all([
          readBatteryStatus(),
          window.petApp.getSystemStatus().catch(() => undefined)
        ]);
        const cue = getDesktopEventCue({
          online: navigator.onLine,
          battery,
          memory: systemStatus?.memory,
          seenCueKeys: options.seenDesktopCueKeysRef.current
        });
        if (!cue || options.bubble || options.chatOpen) {
          return;
        }
        options.seenDesktopCueKeysRef.current.add(cue.key);
        runtimeRef.current.updatePetMood("workTooLong");
        runtimeRef.current.setTimedPetStatus(cue.status, 1800);
        runtimeRef.current.showBubble(cue.bubble, "info");
      } catch {
        // Desktop status is helpful but optional.
      }
    };

    void tick();
    const timer = window.setInterval(tick, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [options.bubble, options.chatOpen, options.mode, options.state]);

  useEffect(() => {
    if (!options.state || options.mode === "manager") {
      return;
    }

    const tick = () => {
      void runtimeRef.current.runHeartbeatCheck();
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [options.mode, options.state]);

  useEffect(() => {
    if (!options.state?.settings.network.autoCheckEnabled) {
      options.networkCheckStartedRef.current = false;
      return;
    }
    if (options.networkCheckStartedRef.current) {
      return;
    }

    options.networkCheckStartedRef.current = true;
    const run = () => {
      void runtimeRef.current.runNetworkCheck();
    };
    run();
    const timer = window.setInterval(run, 6 * 60 * 60 * 1000);
    return () => {
      options.networkCheckStartedRef.current = false;
      window.clearInterval(timer);
    };
  }, [options.state?.settings.network.autoCheckEnabled]);

  useEffect(() => {
    return () => {
      if (options.petActionStatusTimeoutRef.current) {
        window.clearTimeout(options.petActionStatusTimeoutRef.current);
        options.petActionStatusTimeoutRef.current = undefined;
      }
      if (options.focusCompanionTimerRef.current) {
        window.clearTimeout(options.focusCompanionTimerRef.current);
        options.focusCompanionTimerRef.current = undefined;
      }
    };
  }, []);
}

function shouldCollapseToBubble(options: {
  busy: boolean;
  chatOpen: boolean;
  bubbleOpen: boolean;
  idleMs: number;
  thresholdMs: number;
}) {
  return !options.busy && options.chatOpen && !options.bubbleOpen && options.idleMs >= options.thresholdMs;
}
