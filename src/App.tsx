import { useEffect, useMemo, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import ManagerPage from "./components/ManagerPage";
import PetBubble from "./components/PetBubble";
import PetStage from "./components/PetStage";
import {
  appendConversationMessages,
  createConversation,
  deleteConversation,
  ensureActiveConversation,
  renameConversation,
} from "./lib/conversations";
import {
  buildHeartbeatPrompt,
  chooseLocalGreeting,
  getDueGreetingSlot,
  shouldCollapseToBubble,
  type GreetingSlotId
} from "./lib/heartbeat";
import { getLonelyCue } from "./lib/lonelyCue";
import { getWorkRhythmCue } from "./lib/workRhythm";
import type { ChatMessage } from "../electron/chatClient";
import type { AppSettings, PetConversationMode } from "../electron/settingsStore";
import type { AnimationState } from "./lib/atlas";
import type { PetAppState } from "./global";
import type { PetAction } from "./lib/petActions";
import { ensureProjects } from "./lib/projects";
import { getModelSettingsById, getPetModelSettings } from "./lib/modelProfiles";
import { buildPetJumpCommand, buildPetMoveCommand, resolveEdgePosition, resolveVisiblePetPosition, type PetMoveCommand, type PetEdge } from "./lib/petMotion";
import { intentToAssistantMessage, resolvePetInteractionIntent } from "./lib/petInteractionIntents";
import { resolveReminderTarget } from "./lib/reminderTarget";

type AppMode = "pet" | "manager";
type BubbleState = {
  text: string;
  tone: "info" | "working";
};

const BUBBLE_AUTO_HIDE_MS = 15000;

export default function App() {
  const mode = readMode();
  const [state, setState] = useState<PetAppState>();
  const [chatOpen, setChatOpen] = useState(false);
  const [bubble, setBubble] = useState<BubbleState>();
  const [status, setStatus] = useState<AnimationState>("idle");
  const [error, setError] = useState<string>();
  const [sendingRequestId, setSendingRequestId] = useState<string>();
  const busyRef = useRef(false);
  const activeRequestIdRef = useRef<string>();
  const lastInteractionRef = useRef(Date.now());
  const seenWorkCueKeysRef = useRef<Set<string>>(new Set());
  const cursorPositionRef = useRef({ x: 0, y: 0, at: 0 });
  const lastLonelyCueAtRef = useRef(0);
  const networkCheckStartedRef = useRef(false);
  const mousePassthroughRef = useRef<boolean>();
  const petActionStatusTimeoutRef = useRef<number>();

  useEffect(() => {
    void window.petApp.getInitialState().then((nextState) => {
      setState(withActiveConversation(nextState));
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "启动失败");
    });
    return window.petApp.onStateChanged((nextState) => setState(withActiveConversation(nextState)));
  }, []);

  useEffect(() => {
    if (mode === "manager") {
      return;
    }
    void window.petApp.setChatOpen(chatOpen);
    return () => {
      void window.petApp.setChatOpen(false);
    };
  }, [chatOpen, mode]);

  useEffect(() => {
    if (mode === "manager") {
      return;
    }
    return window.petApp.onOutsideInteraction(dismissFloatingPetUi);
  }, [mode]);

  useEffect(() => {
    if (mode === "manager") {
      return;
    }
    return window.petApp.onExternalPetActions((actions) => {
      void applyPetActions(actions);
    });
  }, [mode, state]);

  useEffect(() => {
    if (mode === "manager") {
      return;
    }

    const dismissOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest(".pet-canvas, .pet-bubble, .chat-panel")) {
        return;
      }
      dismissFloatingPetUi();
    };

    window.addEventListener("pointerdown", dismissOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", dismissOnOutsidePointerDown, true);
  }, [mode]);

  useEffect(() => {
    if (mode === "manager") {
      return;
    }

    const interactiveSelector = ".pet-canvas, .pet-bubble, .chat-panel";
    const syncMousePassthrough = (event: MouseEvent) => {
      cursorPositionRef.current = {
        x: event.screenX,
        y: event.screenY,
        at: Date.now()
      };
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const interactive = Boolean(target?.closest(interactiveSelector));
      const passthrough = !interactive;
      if (mousePassthroughRef.current === passthrough) {
        return;
      }
      mousePassthroughRef.current = passthrough;
      void window.petApp.setMousePassthrough(passthrough);
    };

    const enablePassthrough = () => {
      if (mousePassthroughRef.current !== true) {
        mousePassthroughRef.current = true;
        void window.petApp.setMousePassthrough(true);
      }
    };

    window.addEventListener("mousemove", syncMousePassthrough);
    window.addEventListener("mouseleave", enablePassthrough);
    enablePassthrough();
    return () => {
      window.removeEventListener("mousemove", syncMousePassthrough);
      window.removeEventListener("mouseleave", enablePassthrough);
    };
  }, [mode]);

  const activePet = state?.activePet;
  const activeConversation = state?.settings.conversations.find(
    (conversation) => conversation.id === state.settings.activeConversationId
  );
  const activeProject = state?.settings.projects.find((project) => project.id === state.settings.activeProjectId);
  const currentProjectConversations = state?.settings.conversations.filter(
    (conversation) => (conversation.projectId || "") === (state.settings.activeProjectId || "")
  ) ?? [];
  const messages = activeConversation?.messages ?? [];
  const displayName = activePet?.displayName ?? "哈基Mi";
  const currentPetModel = state && activePet
    ? getPetModelSettings(state.settings, activePet.id, "chat")
    : undefined;
  const currentPetModelId = currentPetModel?.id;
  const agentMode = currentPetModel?.provider === "claude-agent";
  const activeAgentModelId = state?.settings.activeAgentModelId;
  const activeAgentModel = state ? getModelSettingsById(state.settings, activeAgentModelId, "agent") : undefined;
  const officeUsesWorkAgent = Boolean(activeAgentModel);
  const officeUsesClaudeCode = activeAgentModel?.provider === "claude-agent";
  const chatBindingLabel = [
    activeProject?.name || "当前项目",
    activeConversation?.title || "新会话",
    currentPetModel?.name || "默认模型"
  ].join(" / ");
  const animationOverride = useMemo(() => (status === "idle" ? undefined : status), [status]);

  useEffect(() => {
    if (!bubble) {
      return;
    }

    const timer = window.setTimeout(() => setBubble(undefined), BUBBLE_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  useEffect(() => {
    if (!state || mode === "manager") {
      return;
    }

    const timer = window.setInterval(() => {
      const settings = state.settings;
      if (settings.heartbeat.collapseToBubbleEnabled && shouldCollapseToBubble({
        busy: busyRef.current,
        chatOpen,
        bubbleOpen: Boolean(bubble),
        idleMs: Date.now() - lastInteractionRef.current,
        thresholdMs: settings.heartbeat.bubbleIdleSeconds * 1000
      })) {
        setChatOpen(false);
        setBubble({
          text: agentMode ? "哈基Mi正在办公，完成后会把结果放在这里。" : "哈基Mi正在想，等会儿用气泡告诉你。",
          tone: "working"
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [agentMode, bubble, chatOpen, mode, state]);

  useEffect(() => {
    if (!state || mode === "manager" || !state.settings.heartbeat.enabled) {
      return;
    }

    const triggerCue = (cue: NonNullable<ReturnType<typeof getWorkRhythmCue>>) => {
      seenWorkCueKeysRef.current.add(cue.key);
      setChatOpen(false);
      if (cue.followCursor) {
        const cursor = cursorPositionRef.current;
        const cursorIsFresh = cursor.at > 0 && Date.now() - cursor.at <= 5000;
        if (cursorIsFresh) {
          void window.petApp.getPetWindowBounds().then((currentBounds) => {
            const command = buildPetMoveCommand(
              { x: currentBounds.x, y: currentBounds.y },
              resolveReminderTarget(cursor.x, cursor.y, state.screen, currentBounds)
            );
            void window.petApp.movePetTo(command);
            setTimedPetStatus(cue.followStatus, command.durationMs + 1000);
          });
        } else {
          setTimedPetStatus(cue.followStatus, 1000);
        }
      } else {
        setTimedPetStatus(cue.followStatus, 1000);
      }
      showBubble(cue.bubble, cue.tone);
    };

    const tick = () => {
      const cue = getWorkRhythmCue({
        now: new Date(),
        activeRecently: busyRef.current || Date.now() - lastInteractionRef.current <= 120_000,
        bubbleOpen: Boolean(bubble),
        seenCueKeys: seenWorkCueKeysRef.current
      });
      if (cue) {
        triggerCue(cue);
      }
    };

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [bubble, mode, state]);

  useEffect(() => {
    if (!state || mode === "manager") {
      return;
    }

    if (!import.meta.env.DEV) {
      return;
    }

    const triggerLonelyCue = () => {
      setChatOpen(false);
      setTimedPetStatus("failed", 8000);
      showBubble("还在吗？哈基Mi有点想你了。", "info");
    };

    window.addEventListener("hajimi:trigger-lonely-cue", triggerLonelyCue);
    return () => window.removeEventListener("hajimi:trigger-lonely-cue", triggerLonelyCue);
  }, [mode, state]);

  useEffect(() => {
    if (!state || mode === "manager") {
      return;
    }

    const tick = () => {
      const cue = getLonelyCue({
        idleMs: Date.now() - lastInteractionRef.current,
        busy: busyRef.current,
        chatOpen,
        bubbleOpen: Boolean(bubble),
        movementEnabled: state.settings.movementEnabled,
        now: new Date(),
        lastCueAt: lastLonelyCueAtRef.current
      });
      if (!cue) {
        return;
      }
      lastLonelyCueAtRef.current = Date.now();
      setChatOpen(false);
      setTimedPetStatus(cue.status, 1600);
      showBubble(cue.bubble, cue.tone);
    };

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [bubble, chatOpen, mode, state]);

  useEffect(() => {
    if (!state || mode === "manager") {
      return;
    }

    const tick = () => {
      void runHeartbeatCheck();
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [mode, state]);

  useEffect(() => {
    if (!state?.settings.network.autoCheckEnabled || networkCheckStartedRef.current) {
      return;
    }

    networkCheckStartedRef.current = true;
    const run = () => {
      void runNetworkCheck();
    };
    run();
    const timer = window.setInterval(run, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [state?.settings.network.autoCheckEnabled]);

  useEffect(() => {
    return () => {
      if (petActionStatusTimeoutRef.current) {
        window.clearTimeout(petActionStatusTimeoutRef.current);
      }
    };
  }, []);

  async function runHeartbeatCheck() {
    if (!state || !state.settings.heartbeat.enabled || busyRef.current) {
      return;
    }

    const slot = getDueGreetingSlot(new Date(), state.settings.heartbeat.sentGreetingKeys);
    if (!slot) {
      return;
    }

    const nextSettings = {
      ...state.settings,
      heartbeat: {
        ...state.settings.heartbeat,
        sentGreetingKeys: [...state.settings.heartbeat.sentGreetingKeys, slot.key].slice(-90)
      }
    };
    setState({ ...state, settings: nextSettings });
    void persistSettings(nextSettings);

    const fallback = chooseLocalGreeting(slot.id, Date.now());
    let text = fallback;
    if (state.settings.heartbeat.modelGreetingEnabled && state.settings.api.apiKey.trim()) {
      try {
        const response = await window.petApp.heartbeatGreeting(buildHeartbeatPrompt(slot.id));
        const content = response.content.trim();
        if (content && content !== "HEARTBEAT_OK") {
          text = content;
        }
      } catch {
        text = fallback;
      }
    }

    showBubble(text, "info", slot.id);
  }

  async function runNetworkCheck() {
    if (!state?.settings.network.autoCheckEnabled) {
      return;
    }

    try {
      const noticeResult = await window.petApp.checkNotices();
      const notice = noticeResult.notices[0];
      if (notice) {
        showBubble(`${notice.title}：${notice.message}`, "info");
        await window.petApp.markNoticeRead(notice.id);
      }
    } catch {
      // Remote notices are opportunistic and should never disturb desktop pet use.
    }

    try {
      const update = await window.petApp.checkUpdates();
      if (update.status === "available" && update.version) {
        showBubble(`发现新版本 ${update.version}，可以在系统页检查更新。`, "info");
      }
    } catch {
      // Update checks are best-effort.
    }
  }

  function normalizeUserMessage(input: string | ChatMessage): ChatMessage {
    if (typeof input === "string") {
      return { role: "user", content: input.trim() };
    }
    return {
      ...input,
      role: "user",
      content: input.content.trim(),
      displayContent: input.displayContent?.trim() || undefined
    };
  }

  function createChatRequestId() {
    return globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function cancelActiveMessage() {
    const activeRequestId = activeRequestIdRef.current;
    if (!activeRequestId) {
      return;
    }
    await window.petApp.cancelChatTask(activeRequestId);
  }

  function finishChatRequest(requestId: string) {
    if (activeRequestIdRef.current !== requestId) {
      return;
    }
    activeRequestIdRef.current = undefined;
    setSendingRequestId(undefined);
    busyRef.current = false;
  }

  function isCancelledChatError(errorValue: unknown) {
    const message = readErrorMessage(errorValue);
    return /已停止|cancel|abort/i.test(message);
  }

  async function sendMessage(input: string | ChatMessage) {
    const userMessage = normalizeUserMessage(input);
    const content = userMessage.content;
    if (!state || !activeConversation || !content.trim()) {
      return;
    }
    markInteraction();
    const conversationId = activeConversation.id;
    const modeForRequest: PetConversationMode = agentMode ? "agent" : "chat";
    if (await runLocalPetInteraction(content, userMessage, conversationId, modeForRequest)) {
      return;
    }
    if (agentMode && !state.settings.agent.workspaceDir) {
      setError("先在管理页或快速设置里选择一个办公区。");
      return;
    }
    const optimisticSettings = appendConversationMessages(
      state.settings,
      conversationId,
      [userMessage],
      modeForRequest
    );
    setState({ ...state, settings: optimisticSettings });
    setStatus(agentMode ? "review" : "waiting");
    setError(undefined);
    const requestId = createChatRequestId();
    activeRequestIdRef.current = requestId;
    setSendingRequestId(requestId);
    busyRef.current = true;
    const startedAt = Date.now();

    try {
      const requestMessages = [...activeConversation.messages, userMessage];
      const response = agentMode
        ? await window.petApp.runAgentTask(content.trim(), currentPetModelId, requestId)
        : await window.petApp.sendChat(requestMessages, currentPetModelId, requestId);
      const responseWithDuration = { ...response, durationMs: Date.now() - startedAt };
      const labelledResponse = labelPetResponse(responseWithDuration, displayName, state.settings.activePetIds.length > 1);
      const responseSettings = appendConversationMessages(
        optimisticSettings,
        conversationId,
        [labelledResponse],
        modeForRequest
      );
      await persistSettings(responseSettings);
      busyRef.current = false;
      const petActions = response.petActions ?? [];
      await applyPetActions(petActions, responseSettings);
      if (!petActions.some((action) => action.type === "say")) {
        showBubble(labelledResponse.content, "info");
      }
      if (!petActions.some((action) => action.type === "jump" || action.type === "runAround" || action.type === "mood" || action.type === "moveToEdge" || action.type === "moveTo" || action.type === "setMovement" || action.type === "stopMovement")) {
        setTimedPetStatus("waving", 900);
      }
    } catch (err) {
      if (isCancelledChatError(err)) {
        setTimedPetStatus("idle", 0);
        return;
      }
      setTimedPetStatus("failed", 1200);
      setError(readErrorMessage(err));
      showBubble(readErrorMessage(err), "info");
    } finally {
      finishChatRequest(requestId);
    }
  }

  async function sendOfficeMessage(input: string | ChatMessage) {
    const userMessage = normalizeUserMessage(input);
    const content = userMessage.content;
    if (!state || !activeConversation || !content.trim()) {
      return;
    }
    markInteraction();
    const conversationId = activeConversation.id;
    const modeForRequest: PetConversationMode = officeUsesWorkAgent ? "agent" : "chat";
    if (await runLocalPetInteraction(content, userMessage, conversationId, modeForRequest)) {
      return;
    }
    if (officeUsesWorkAgent && !state.settings.agent.workspaceDir) {
      setError("先在管理页或快速设置里选择一个办公区。");
      return;
    }
    const optimisticSettings = appendConversationMessages(
      state.settings,
      conversationId,
      [userMessage],
      modeForRequest
    );
    setState({ ...state, settings: optimisticSettings });
    setStatus(officeUsesWorkAgent ? "review" : "waiting");
    setError(undefined);
    const requestId = createChatRequestId();
    activeRequestIdRef.current = requestId;
    setSendingRequestId(requestId);
    busyRef.current = true;
    const startedAt = Date.now();

    try {
      const requestMessages = [...activeConversation.messages, userMessage];
      const response = officeUsesWorkAgent
        ? await window.petApp.runAgentTask(content.trim(), activeAgentModelId, requestId)
        : await window.petApp.sendChat(requestMessages, activeAgentModelId, requestId);
      const responseWithDuration = { ...response, durationMs: Date.now() - startedAt };
      const labelledResponse = labelPetResponse(responseWithDuration, displayName, state.settings.activePetIds.length > 1);
      const responseSettings = appendConversationMessages(
        optimisticSettings,
        conversationId,
        [labelledResponse],
        modeForRequest
      );
      await persistSettings(responseSettings);
      busyRef.current = false;
      const petActions = response.petActions ?? [];
      await applyPetActions(petActions, responseSettings);
      if (!petActions.some((action) => action.type === "say")) {
        showBubble(labelledResponse.content, "info");
      }
      if (!petActions.some((action) => action.type === "jump" || action.type === "runAround" || action.type === "mood" || action.type === "moveToEdge" || action.type === "moveTo" || action.type === "setMovement" || action.type === "stopMovement")) {
        setTimedPetStatus("waving", 900);
      }
    } catch (err) {
      if (isCancelledChatError(err)) {
        setTimedPetStatus("idle", 0);
        return;
      }
      setTimedPetStatus("failed", 1200);
      setError(readErrorMessage(err));
      showBubble(readErrorMessage(err), "info");
    } finally {
      finishChatRequest(requestId);
    }
  }

  async function runLocalPetInteraction(
    content: string,
    userMessage: ChatMessage,
    conversationId: string,
    modeForRequest: PetConversationMode
  ) {
    if (!state) {
      return false;
    }
    const intent = resolvePetInteractionIntent(content);
    if (!intent) {
      return false;
    }

    const response = intentToAssistantMessage(intent);
    const labelledResponse = labelPetResponse(response, displayName, state.settings.activePetIds.length > 1);
    const responseSettings = appendConversationMessages(
      state.settings,
      conversationId,
      [userMessage, labelledResponse],
      modeForRequest
    );
    setState({ ...state, settings: responseSettings });
    setError(undefined);
    await persistSettings(responseSettings);
    await applyPetActions(response.petActions ?? [], responseSettings);
    showBubble(labelledResponse.content, "info");
    return true;
  }

  async function persistSettings(settings: AppSettings) {
    setState(await window.petApp.saveSettings(settings));
  }

  async function saveSettings(settings: AppSettings) {
    await persistSettings(ensureActiveConversation(settings));
  }

  async function chooseWorkspace() {
    markInteraction();
    setState(withActiveConversation(await window.petApp.chooseWorkspace()));
  }

  async function switchProject(projectId: string) {
    markInteraction();
    setState(withActiveConversation(await window.petApp.switchProject(projectId)));
  }

  async function deleteProject(projectId: string) {
    markInteraction();
    setState(withActiveConversation(await window.petApp.deleteProject(projectId)));
  }

  async function deletePet(petId: string) {
    markInteraction();
    setState(withActiveConversation(await window.petApp.deletePet(petId)));
  }

  async function createNewConversation(modeForNewConversation: PetConversationMode) {
    if (!state) {
      return;
    }
    markInteraction();
    const nextSettings = createConversation(state.settings, modeForNewConversation);
    await persistSettings(nextSettings);
    setChatOpen(true);
    setBubble(undefined);
  }

  async function switchConversation(conversationId: string) {
    if (!state) {
      return;
    }
    markInteraction();
    await persistSettings({ ...state.settings, activeConversationId: conversationId });
  }

  async function removeConversation(conversationId: string) {
    if (!state) {
      return;
    }
    markInteraction();
    await persistSettings(deleteConversation(state.settings, conversationId));
  }

  async function renameConversationTitle(conversationId: string, title: string) {
    if (!state) {
      return;
    }
    markInteraction();
    await persistSettings(renameConversation(state.settings, conversationId, title));
  }

  function openChat() {
    markInteraction();
    setBubble(undefined);
    setChatOpen(true);
  }

  function dismissFloatingPetUi() {
    setChatOpen(false);
    setBubble(undefined);
  }

  function showBubble(text: string, tone: BubbleState["tone"], slotId?: GreetingSlotId) {
    const compact = text.length > 82 ? `${text.slice(0, 82)}...` : text;
    setBubble({ text: compact, tone });
    if (slotId) {
      setTimedPetStatus("waving", 1000);
    }
  }

  function setTimedPetStatus(nextStatus: AnimationState, durationMs: number) {
    if (petActionStatusTimeoutRef.current) {
      window.clearTimeout(petActionStatusTimeoutRef.current);
    }
    setStatus(nextStatus);
    if (nextStatus === "idle" || durationMs <= 0) {
      return;
    }
    petActionStatusTimeoutRef.current = window.setTimeout(() => setStatus("idle"), durationMs);
  }

  function playPetMove(command: PetMoveCommand) {
    setTimedPetStatus(command.animation, command.durationMs);
    void window.petApp.movePetTo(command);
  }

  async function playPetJump() {
    const currentBounds = await window.petApp.getPetWindowBounds();
    playPetMove(buildPetJumpCommand({ x: currentBounds.x, y: currentBounds.y }));
  }

  async function playPetMoveToPoint(point: { x: number; y: number }) {
    if (!state) {
      return;
    }
    const currentBounds = await window.petApp.getPetWindowBounds();
    const target = resolveVisiblePetPosition(point, state.settings.petScale);
    playPetMove(buildPetMoveCommand({ x: currentBounds.x, y: currentBounds.y }, target));
  }

  async function playPetMoveToEdge(edge: PetEdge) {
    if (!state) {
      return;
    }
    const currentBounds = await window.petApp.getPetWindowBounds();
    const target = resolveEdgePosition(edge, state.screen, currentBounds, state.settings.petScale);
    playPetMove(buildPetMoveCommand({ x: currentBounds.x, y: currentBounds.y }, target));
  }

  async function applyPetActions(actions: PetAction[], baseSettings = state?.settings) {
    for (const action of actions) {
      if (action.type === "say") {
        showBubble(action.text, "info");
      }
      if (action.type === "jump") {
        await playPetJump();
      }
      if (action.type === "runAround") {
        setTimedPetStatus("running", (action.seconds ?? 3) * 1000);
      }
      if (action.type === "moveTo" && state) {
        await playPetMoveToPoint({ x: action.x, y: action.y });
      }
      if (action.type === "moveToEdge" && state) {
        await playPetMoveToEdge(action.edge);
      }
      if (action.type === "mood") {
        const moodStatus: Record<typeof action.mood, AnimationState> = {
          idle: "idle",
          happy: "waving",
          working: "review",
          waiting: "waiting",
          review: "review",
          failed: "failed"
        };
        setTimedPetStatus(moodStatus[action.mood], action.mood === "idle" ? 0 : 1200);
      }
      if (action.type === "openChat") {
        setChatOpen(true);
        setBubble(undefined);
      }
      if (action.type === "setMovement" && baseSettings) {
        const nextSettings = {
          ...baseSettings,
          movementEnabled: action.enabled,
          movementIntensity: action.intensity ?? baseSettings.movementIntensity
        };
        await persistSettings(nextSettings);
        setTimedPetStatus(action.enabled ? "running" : "idle", action.enabled ? 900 : 0);
        showBubble(action.enabled ? "好呀，我自己去玩一会儿。" : "好，我安静一点。", "info");
      }
      if (action.type === "stopMovement") {
        if (baseSettings) {
          await persistSettings({ ...baseSettings, movementEnabled: false });
        }
        setTimedPetStatus("idle", 0);
        showBubble("好，我安静一点。", "info");
      }
    }
  }

  function markInteraction() {
    lastInteractionRef.current = Date.now();
  }

  if (!state || !activePet || !activeConversation) {
    return (
      <main className={mode === "manager" ? "manager-shell" : "app-shell"}>
        <div className="pet-card">{error ?? "Loading"}</div>
      </main>
    );
  }

  if (mode === "manager") {
    return (
      <ManagerPage
        state={state}
        onImport={async () => setState(await window.petApp.importPet())}
        onDeletePet={deletePet}
        onChooseWorkspace={chooseWorkspace}
        onSwitchProject={switchProject}
        onDeleteProject={deleteProject}
        onTestModel={(model) => window.petApp.testModel(model)}
        onCheckUpdates={() => window.petApp.checkUpdates()}
        onDownloadUpdate={() => window.petApp.downloadUpdate()}
        onInstallUpdate={() => window.petApp.installUpdate()}
        onCheckNotices={() => window.petApp.checkNotices()}
        onStartChannel={(provider) => window.petApp.startChannel(provider)}
        onStopChannel={(provider) => window.petApp.stopChannel(provider)}
        onTestChannel={(provider) => window.petApp.testChannel(provider)}
        onSave={saveSettings}
        chatError={error}
        onCreateConversation={createNewConversation}
        onSwitchConversation={switchConversation}
        onDeleteConversation={removeConversation}
        onRenameConversation={renameConversationTitle}
        onSendMessage={sendMessage}
        onSendOfficeMessage={sendOfficeMessage}
        onCancelMessage={cancelActiveMessage}
      />
    );
  }

  return (
    <main className="app-shell">
      {chatOpen && (
        <ChatPanel
          displayName={displayName}
          conversations={currentProjectConversations}
          activeConversationId={activeConversation.id}
          bindingLabel={chatBindingLabel}
          messages={messages}
          error={error}
          agentMode={agentMode}
          sending={Boolean(sendingRequestId)}
          onCreateConversation={createNewConversation}
          onSwitchConversation={switchConversation}
          onDeleteConversation={removeConversation}
          onSend={sendMessage}
          onCancel={cancelActiveMessage}
          onClose={() => {
            markInteraction();
            setChatOpen(false);
          }}
        />
      )}

      {bubble && !chatOpen && (
        <PetBubble
          text={bubble.text}
          tone={bubble.tone}
          onOpen={openChat}
          onClose={() => setBubble(undefined)}
        />
      )}

      <PetStage
        pet={activePet}
        settings={state.settings}
        screen={state.screen}
        windowBounds={state.windowBounds}
        chatOpen={chatOpen}
        animationOverride={animationOverride}
        onClick={openChat}
      />
    </main>
  );
}

function withActiveConversation(state: PetAppState): PetAppState {
  return { ...state, settings: ensureActiveConversation(ensureProjects(state.settings)) };
}

function readMode(): AppMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "manager" ? "manager" : "pet";
}

function readErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "聊天请求失败";
}

function labelPetResponse(response: ChatMessage, displayName: string, enabled: boolean): ChatMessage {
  if (!enabled || !response.content.trim()) {
    return response;
  }
  const prefix = `${displayName}: `;
  if (response.content.startsWith(prefix)) {
    return response;
  }
  return {
    ...response,
    content: `${prefix}${response.content}`
  };
}
