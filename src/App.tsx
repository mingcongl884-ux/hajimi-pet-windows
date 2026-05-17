import { useEffect, useMemo, useRef, useState } from "react";
import ManagerPage from "./components/ManagerPage";
import PetBubble from "./components/PetBubble";
import PetChatBubble from "./components/PetChatBubble";
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
  type GreetingSlotId
} from "./lib/heartbeat";
import type { ChatMessage } from "../electron/chatClient";
import type { AppSettings, PetConversationMode } from "../electron/settingsStore";
import type { AnimationState } from "./lib/atlas";
import type { PetAppState } from "./global";
import type { PetAction } from "./lib/petActions";
import { ensureProjects } from "./lib/projects";
import { getModelSettingsById } from "./lib/modelProfiles";
import { buildPetJumpCommand, buildPetMoveCommand, resolveEdgePosition, resolveVisiblePetPosition, type PetMoveCommand, type PetEdge } from "./lib/petMotion";
import { intentToAssistantMessage, resolvePetInteractionIntent } from "./lib/petInteractionIntents";
import { choosePetGreeting } from "./lib/petGreetings";
import { formatFocusCompanionDoneBubble, resolveFocusCompanionIntent } from "./lib/focusCompanion";
import { evolvePetMood, moodToAnimation, pickMoodBubble, type PetExperienceMood } from "./lib/petMood";
import { formatUpdateAnnouncement } from "./lib/updateAnnouncement";
import { extractMemoryFilesFromDisplay } from "./lib/projectMemory";
import { readDisplayErrorMessage } from "./lib/errorMessage";
import { buildOfficePetFeedbackActions, type OfficePetFeedbackEvent, type OfficePetFeedbackOptions } from "./lib/officePetFeedback";
import type { OfficeSkillRequest } from "./lib/skills";
import { usePetRuntimeEffects } from "./hooks/usePetRuntimeEffects";
import type { AppMode, BubbleState } from "./types/petUi";

export default function App() {
  const mode = readMode();
  const [state, setState] = useState<PetAppState>();
  const [chatOpen, setChatOpenState] = useState(false);
  const [bubble, setBubble] = useState<BubbleState>();
  const [status, setStatus] = useState<AnimationState>("idle");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const stateRef = useRef<PetAppState>();
  const chatOpenRef = useRef(false);
  const busyRef = useRef(false);
  const activeRequestIdRef = useRef<string>();
  const lastInteractionRef = useRef(Date.now());
  const seenWorkCueKeysRef = useRef<Set<string>>(new Set());
  const seenDesktopCueKeysRef = useRef<Set<string>>(new Set());
  const cursorPositionRef = useRef({ x: 0, y: 0, at: 0 });
  const lastLonelyCueAtRef = useRef(0);
  const networkCheckStartedRef = useRef(false);
  const mousePassthroughRef = useRef<boolean>();
  const petActionStatusTimeoutRef = useRef<number>();
  const officeLongCueTimeoutRef = useRef<number>();
  const officeLongCueCountRef = useRef(0);
  const focusCompanionTimerRef = useRef<number>();
  const petMoodRef = useRef<PetExperienceMood>("idle");

  function setChatOpen(open: boolean) {
    chatOpenRef.current = open;
    setChatOpenState(open);
  }

  useEffect(() => {
    void window.petApp.getInitialState().then((nextState) => {
      setState(withActiveConversation(nextState));
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "启动失败");
    });
    return window.petApp.onStateChanged((nextState) => setState(withActiveConversation(nextState)));
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      if (target?.closest(".pet-canvas, .pet-bubble, .pet-chat-bubble")) {
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

    const interactiveSelector = ".pet-canvas, .pet-bubble, .pet-chat-bubble";
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
  const activeProjectId = state?.settings.activeProjectId ?? "";
  const activeProject = state?.settings.projects.find((project) => project.id === activeProjectId);
  const activeProjectConversations = state?.settings.conversations.filter(
    (conversation) => (conversation.projectId || "") === activeProjectId
  ) ?? [];
  const displayName = activePet?.displayName ?? "哈基Mi";
  const activeAgentModelId = state?.settings.activeAgentModelId;
  const activeAgentModel = state ? getModelSettingsById(state.settings, activeAgentModelId, "agent") : undefined;
  const activeModelLabel = activeAgentModel?.name ?? "默认模型";
  const petChatBindingLabel = `${activeProject?.name ?? "当前项目"} / ${activeConversation?.title ?? "新会话"} / ${activeModelLabel}`;
  const officeUsesWorkAgent = Boolean(activeAgentModel);
  const officeUsesClaudeCode = activeAgentModel?.provider === "claude-agent";
  const agentMode = officeUsesClaudeCode;
  const animationOverride = useMemo(() => (status === "idle" ? undefined : status), [status]);
  usePetRuntimeEffects({
    mode,
    state,
    bubble,
    chatOpen,
    agentMode,
    busyRef,
    lastInteractionRef,
    seenWorkCueKeysRef,
    seenDesktopCueKeysRef,
    cursorPositionRef,
    lastLonelyCueAtRef,
    networkCheckStartedRef,
    petActionStatusTimeoutRef,
    focusCompanionTimerRef,
    runtime: {
      setBubble,
      setChatOpen,
      setTimedPetStatus,
      showBubble,
      updatePetMood,
      runHeartbeatCheck,
      runNetworkCheck
    }
  });

  function updatePetMood(event: Parameters<typeof evolvePetMood>[1]) {
    const next = evolvePetMood(petMoodRef.current, event);
    petMoodRef.current = next.mood;
    setTimedPetStatus(moodToAnimation(next.mood), next.mood === "idle" ? 0 : 1400);
    return next;
  }

  function startFocusCompanion(title: string, durationMinutes: number) {
    if (focusCompanionTimerRef.current) {
      window.clearTimeout(focusCompanionTimerRef.current);
    }

    updatePetMood("focusStarted");
    const durationMs = durationMinutes * 60 * 1000;
    focusCompanionTimerRef.current = window.setTimeout(() => {
      focusCompanionTimerRef.current = undefined;
      updatePetMood("taskCompleted");
      setChatOpen(false);
      showBubble(formatFocusCompanionDoneBubble(title), "info");
    }, durationMs);
  }

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
    const currentState = stateRef.current;
    if (!currentState?.settings.network.autoCheckEnabled) {
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
        showBubble(formatUpdateAnnouncement(update), "info");
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
    busyRef.current = false;
    setSending(false);
  }

  function isCancelledChatError(errorValue: unknown) {
    const message = readErrorMessage(errorValue);
    return /已停止|cancel|abort/i.test(message);
  }

  async function sendOfficeMessage(input: string | ChatMessage, modelIdOverride?: string, skillRequest?: OfficeSkillRequest) {
    const userMessage = normalizeUserMessage(input);
    const content = userMessage.content;
    if (!state || !activeConversation || !content.trim()) {
      return;
    }
    const requestModelId = modelIdOverride ?? activeAgentModelId;
    const requestModel = getModelSettingsById(state.settings, requestModelId, "agent");
    const requestUsesWorkAgent = Boolean(requestModel);
    markInteraction();
    const conversationId = activeConversation.id;
    const modeForRequest: PetConversationMode = requestUsesWorkAgent ? "agent" : "chat";
    if (await runLocalPetInteraction(content, userMessage, conversationId, modeForRequest)) {
      return;
    }
    if (requestUsesWorkAgent && !state.settings.agent.workspaceDir) {
      const workspaceMessage = "先在管理页或快速设置里选择一个办公区。";
      setError(workspaceMessage);
      throw new Error(workspaceMessage);
    }
    const optimisticSettings = appendConversationMessages(
      state.settings,
      conversationId,
      [userMessage],
      modeForRequest
    );
    setState({ ...state, settings: optimisticSettings });
    setStatus(requestUsesWorkAgent ? "review" : "waiting");
    setError(undefined);
    const requestId = createChatRequestId();
    activeRequestIdRef.current = requestId;
    busyRef.current = true;
    setSending(true);
    const startedAt = Date.now();
    if (requestUsesWorkAgent) {
      await dispatchOfficePetFeedback("started");
      scheduleOfficeLongFeedback(requestId);
    }

    try {
      const requestMessages = [...activeConversation.messages, userMessage];
      const response = requestUsesWorkAgent
        ? await window.petApp.runAgentTask(content.trim(), requestModelId, requestId, skillRequest)
        : await window.petApp.sendChat(requestMessages, requestModelId, requestId);
      const responseWithDuration = { ...response, durationMs: Date.now() - startedAt };
      const labelledResponse = labelPetResponse(responseWithDuration, displayName, state.settings.activePetIds.length > 1);
      const responseSettings = appendConversationMessages(
        optimisticSettings,
        conversationId,
        [labelledResponse],
        modeForRequest
      );
      await persistSettings(responseSettings);
      if (state.settings.activeProjectId) {
        void window.petApp.updateProjectMemory({
          projectId: state.settings.activeProjectId,
          task: userMessage.displayContent ?? content.trim(),
          files: [
            ...extractMemoryFilesFromDisplay(userMessage.displayContent),
            ...(labelledResponse.fileOutputs ?? [])
          ],
          at: new Date().toISOString()
        }).catch(() => undefined);
      }
      busyRef.current = false;
      const petActions = response.petActions ?? [];
      await dispatchPetActions(petActions, responseSettings);
      if (requestUsesWorkAgent) {
        if (!petActions.some((action) => action.type === "say")) {
          await dispatchOfficePetFeedback("completed", {
            fileOutputs: labelledResponse.fileOutputs,
            remoteTarget: state.settings.remoteBridge.activeTargetId !== "local" && Boolean(state.settings.remoteBridge.activeTargetId)
          });
        }
      } else {
        updatePetMood("userReturned");
        if (!petActions.some((action) => action.type === "say")) {
          showBubble(labelledResponse.content, "info");
        }
        if (!petActions.some((action) => action.type === "jump" || action.type === "runAround" || action.type === "mood" || action.type === "moveToEdge" || action.type === "moveTo" || action.type === "setMovement" || action.type === "stopMovement")) {
          setTimedPetStatus("waving", 900);
        }
      }
    } catch (err) {
      if (isCancelledChatError(err)) {
        if (requestUsesWorkAgent) {
          await dispatchOfficePetFeedback("cancelled");
        } else {
          setTimedPetStatus("idle", 0);
        }
        return;
      }
      const displayError = readErrorMessage(err);
      if (requestUsesWorkAgent) {
        await dispatchOfficePetFeedback("failed");
      } else {
        setTimedPetStatus("failed", 1200);
      }
      setError(displayError);
      if (!requestUsesWorkAgent) {
        showBubble(displayError, "info");
      }
      throw new Error(displayError);
    } finally {
      clearOfficeLongFeedback();
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
    const focusIntent = resolveFocusCompanionIntent(content);
    if (focusIntent) {
      const response = {
        role: "assistant" as const,
        content: `好，我陪你专注 ${focusIntent.durationMinutes} 分钟：${focusIntent.title}。`,
        petActions: [{ type: "mood" as const, mood: "working" as const }]
      };
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
      startFocusCompanion(focusIntent.title, focusIntent.durationMinutes);
      showBubble(pickMoodBubble("focused"), "info");
      return true;
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

  function openPetChat() {
    markInteraction();
    setBubble(undefined);
    setChatOpen(true);
  }

  function dismissFloatingPetUi() {
    setChatOpen(false);
    setBubble(undefined);
  }

  function showBubble(text: string, tone: BubbleState["tone"], slotId?: GreetingSlotId) {
    if (chatOpenRef.current) {
      return;
    }
    const compact = text.length > 82 ? `${text.slice(0, 82)}...` : text;
    setBubble({ text: compact, tone });
    if (slotId) {
      setTimedPetStatus("waving", 1000);
    }
  }

  function setTimedPetStatus(nextStatus: AnimationState, durationMs: number) {
    if (petActionStatusTimeoutRef.current) {
      window.clearTimeout(petActionStatusTimeoutRef.current);
      petActionStatusTimeoutRef.current = undefined;
    }
    setStatus(nextStatus);
    if (nextStatus === "idle" || durationMs <= 0) {
      return;
    }
    petActionStatusTimeoutRef.current = window.setTimeout(() => {
      petActionStatusTimeoutRef.current = undefined;
      setStatus("idle");
    }, durationMs);
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
        if (action.mood === "happy") {
          updatePetMood("praised");
        }
        if (action.mood === "working" || action.mood === "review" || action.mood === "waiting") {
          updatePetMood("focusStarted");
        }
        if (action.mood === "failed") {
          updatePetMood("ignoredTooLong");
        }
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
        openPetChat();
      }
      if (action.type === "setMovement" && baseSettings) {
        const nextSettings = {
          ...baseSettings,
          movementEnabled: action.enabled,
          movementIntensity: action.intensity ?? baseSettings.movementIntensity
        };
        await persistSettings(nextSettings);
        updatePetMood(action.enabled ? "userReturned" : "quietRequested");
        showBubble(action.enabled ? "好呀，我自己去玩一会儿。" : choosePetGreeting("quiet"), "info");
      }
      if (action.type === "stopMovement") {
        if (baseSettings) {
          await persistSettings({ ...baseSettings, movementEnabled: false });
        }
        updatePetMood("quietRequested");
        showBubble(choosePetGreeting("quiet"), "info");
      }
    }
  }

  async function dispatchPetActions(actions: PetAction[], baseSettings = state?.settings) {
    if (!actions.length) {
      return;
    }
    if (mode === "manager") {
      await window.petApp.emitExternalPetActions(actions);
      return;
    }
    await applyPetActions(actions, baseSettings);
  }

  async function dispatchOfficePetFeedback(event: OfficePetFeedbackEvent, options?: OfficePetFeedbackOptions) {
    await dispatchPetActions(buildOfficePetFeedbackActions(event, options));
  }

  function scheduleOfficeLongFeedback(requestId: string) {
    clearOfficeLongFeedback();
    officeLongCueCountRef.current = 0;
    const tick = () => {
      if (activeRequestIdRef.current !== requestId || !busyRef.current || officeLongCueCountRef.current >= 3) {
        return;
      }
      officeLongCueCountRef.current += 1;
      void dispatchOfficePetFeedback("long-running");
      officeLongCueTimeoutRef.current = window.setTimeout(tick, 120_000);
    };
    officeLongCueTimeoutRef.current = window.setTimeout(tick, 45_000);
  }

  function clearOfficeLongFeedback() {
    if (officeLongCueTimeoutRef.current) {
      window.clearTimeout(officeLongCueTimeoutRef.current);
      officeLongCueTimeoutRef.current = undefined;
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
        onSendOfficeMessage={sendOfficeMessage}
        onCancelMessage={cancelActiveMessage}
      />
    );
  }

  return (
    <main className="app-shell">
      {bubble && (
        <PetBubble
          text={bubble.text}
          tone={bubble.tone}
          onOpen={openPetChat}
          onClose={() => setBubble(undefined)}
        />
      )}

      {chatOpen && (
        <PetChatBubble
          displayName={displayName}
          bindingLabel={petChatBindingLabel}
          conversations={activeProjectConversations}
          activeConversationId={activeConversation.id}
          messages={activeConversation.messages}
          error={error}
          sending={sending}
          onCreateConversation={() => createNewConversation("agent")}
          onSwitchConversation={switchConversation}
          onDeleteConversation={removeConversation}
          onSend={sendOfficeMessage}
          onCancel={cancelActiveMessage}
          onClose={() => setChatOpen(false)}
        />
      )}

      <PetStage
        pet={activePet}
        settings={state.settings}
        screen={state.screen}
        windowBounds={state.windowBounds}
        chatOpen={chatOpen}
        animationOverride={animationOverride}
        onClick={openPetChat}
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
  return readDisplayErrorMessage(error, "聊天请求失败");
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
