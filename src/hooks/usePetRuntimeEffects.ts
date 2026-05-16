/// <reference types="vite/client" />

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
import { shouldCollapseToBubble as shouldCollapseHeartbeatToBubble } from "../lib/heartbeat";
import { createRuntimeSchedule } from "../lib/runtimeScheduler";
import type { AppMode, BubbleState } from "../types/petUi";

type RuntimeCallbacks = {
  setBubble: Dispatch<SetStateAction<BubbleState | undefined>>;
  setChatOpen: (open: boolean) => void;
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
const RUNTIME_TICK_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const DESKTOP_CUE_INTERVAL_MS = 5 * 60 * 1000;
const NETWORK_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type RuntimeScheduleTaskId = "collapse" | "minuteCue" | "desktopCue" | "networkCheck";

export function usePetRuntimeEffects(options: UsePetRuntimeEffectsOptions) {
  const runtimeRef = useRef(options.runtime);
  const optionsRef = useRef(options);

  useEffect(() => {
    runtimeRef.current = options.runtime;
    optionsRef.current = options;
  }, [options]);

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

    const schedule = createRuntimeSchedule<RuntimeScheduleTaskId>([
      { id: "collapse", intervalMs: RUNTIME_TICK_MS },
      { id: "minuteCue", intervalMs: HEARTBEAT_INTERVAL_MS, runOnStart: true },
      { id: "desktopCue", intervalMs: DESKTOP_CUE_INTERVAL_MS, runOnStart: true },
      {
        id: "networkCheck",
        intervalMs: NETWORK_CHECK_INTERVAL_MS,
        runOnStart: true,
        enabled: options.state.settings.network.autoCheckEnabled
      }
    ]);
    options.networkCheckStartedRef.current = options.state.settings.network.autoCheckEnabled;

    const triggerCue = (
      latest: UsePetRuntimeEffectsOptions,
      cue: NonNullable<ReturnType<typeof getWorkRhythmCue>>
    ) => {
      latest.seenWorkCueKeysRef.current.add(cue.key);
      runtimeRef.current.setChatOpen(false);
      if (cue.followCursor) {
        const latestState = latest.state;
        if (!latestState) {
          return;
        }
        const cursor = latest.cursorPositionRef.current;
        const cursorIsFresh = cursor.at > 0 && Date.now() - cursor.at <= 5000;
        if (cursorIsFresh) {
          void window.petApp.getPetWindowBounds().then((currentBounds) => {
            const command = buildPetMoveCommand(
              { x: currentBounds.x, y: currentBounds.y },
              resolveReminderTarget(cursor.x, cursor.y, latestState.screen, currentBounds)
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

    const runCollapseTick = () => {
      const latest = optionsRef.current;
      const settings = latest.state?.settings;
      if (!settings) {
        return;
      }

      if (settings.heartbeat.collapseToBubbleEnabled && shouldCollapseHeartbeatToBubble({
        busy: latest.busyRef.current,
        chatOpen: latest.chatOpen,
        bubbleOpen: Boolean(latest.bubble),
        idleMs: Date.now() - latest.lastInteractionRef.current,
        thresholdMs: settings.heartbeat.bubbleIdleSeconds * 1000
      })) {
        runtimeRef.current.setChatOpen(false);
        runtimeRef.current.setBubble({
          text: latest.agentMode ? "哈基Mi正在办公，完成后会把结果放在这里。" : "哈基Mi正在想，等会儿用气泡告诉你。",
          tone: "working"
        });
      }
    };

    function runMinuteTick() {
      const latest = optionsRef.current;
      const latestState = latest.state;
      if (!latestState || latest.mode === "manager") {
        return;
      }

      if (latestState.settings.heartbeat.enabled) {
        const workCue = getWorkRhythmCue({
          now: new Date(),
          activeRecently: latest.busyRef.current || Date.now() - latest.lastInteractionRef.current <= 120_000,
          bubbleOpen: Boolean(latest.bubble),
          seenCueKeys: latest.seenWorkCueKeysRef.current
        });
        if (workCue) {
          triggerCue(latest, workCue);
          return;
        }
      }

      const lonelyCue = getLonelyCue({
        idleMs: Date.now() - latest.lastInteractionRef.current,
        busy: latest.busyRef.current,
        chatOpen: latest.chatOpen,
        bubbleOpen: Boolean(latest.bubble),
        movementEnabled: latestState.settings.movementEnabled,
        now: new Date(),
        lastCueAt: latest.lastLonelyCueAtRef.current
      });
      if (lonelyCue) {
        latest.lastLonelyCueAtRef.current = Date.now();
        runtimeRef.current.setChatOpen(false);
        runtimeRef.current.setTimedPetStatus(lonelyCue.status, 1600);
        runtimeRef.current.showBubble(lonelyCue.bubble, lonelyCue.tone);
        return;
      }

      void runtimeRef.current.runHeartbeatCheck();
    }

    const readBatteryStatus = async () => {
      const navigatorWithBattery = navigator as Navigator & {
        getBattery?: () => Promise<{ charging: boolean; level: number }>;
      };
      return navigatorWithBattery.getBattery?.();
    };

    const runDesktopCueTick = async () => {
      const latest = optionsRef.current;
      if (!latest.state || latest.mode === "manager") {
        return;
      }

      try {
        const [battery, systemStatus] = await Promise.all([
          readBatteryStatus(),
          window.petApp.getSystemStatus().catch(() => undefined)
        ]);
        const cue = getDesktopEventCue({
          online: navigator.onLine,
          battery,
          memory: systemStatus?.memory,
          seenCueKeys: latest.seenDesktopCueKeysRef.current
        });
        if (!cue || latest.bubble || latest.chatOpen) {
          return;
        }
        latest.seenDesktopCueKeysRef.current.add(cue.key);
        runtimeRef.current.updatePetMood("workTooLong");
        runtimeRef.current.setTimedPetStatus(cue.status, 1800);
        runtimeRef.current.showBubble(cue.bubble, "info");
      } catch {
        // Desktop status is helpful but optional.
      }
    };

    const runRuntimeTick = () => {
      const latest = optionsRef.current;
      const now = Date.now();
      const networkEnabled = Boolean(latest.state?.settings.network.autoCheckEnabled);
      schedule.setEnabled("networkCheck", networkEnabled, now);
      latest.networkCheckStartedRef.current = networkEnabled;

      for (const task of schedule.tick(now)) {
        switch (task) {
          case "collapse":
            runCollapseTick();
            break;
          case "minuteCue":
            runMinuteTick();
            break;
          case "desktopCue":
            void runDesktopCueTick();
            break;
          case "networkCheck":
            void runtimeRef.current.runNetworkCheck();
            break;
        }
      }
    };

    runRuntimeTick();
    const timer = window.setInterval(runRuntimeTick, RUNTIME_TICK_MS);
    return () => {
      options.networkCheckStartedRef.current = false;
      window.clearInterval(timer);
    };
  }, [options.mode, Boolean(options.state)]);

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
