import { ArrowUp, BriefcaseBusiness, MessageCircle, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import ManagerPage from "./components/ManagerPage";
import PetBubble from "./components/PetBubble";
import PetStage from "./components/PetStage";
import SettingsPanel from "./components/SettingsPanel";
import {
  appendConversationMessages,
  createConversation,
  deleteConversation,
  ensureActiveConversation,
  renameConversation,
  updateConversationMode
} from "./lib/conversations";
import {
  buildHeartbeatPrompt,
  chooseLocalGreeting,
  getDueGreetingSlot,
  shouldCollapseToBubble,
  type GreetingSlotId
} from "./lib/heartbeat";
import type { ChatMessage } from "../electron/chatClient";
import type { AppSettings, PetConversationMode } from "../electron/settingsStore";
import type { AnimationState } from "./lib/atlas";
import type { PetAppState } from "./global";

type AppMode = "pet" | "manager";
type BubbleState = {
  text: string;
  tone: "info" | "working";
};

export default function App() {
  const mode = readMode();
  const [state, setState] = useState<PetAppState>();
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bubble, setBubble] = useState<BubbleState>();
  const [status, setStatus] = useState<AnimationState>("idle");
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const networkCheckStartedRef = useRef(false);
  const mousePassthroughRef = useRef<boolean>();

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

    const interactiveSelector = ".pet-canvas, .pet-hover-actions, .pet-bubble, .chat-panel, .settings-panel";
    const syncMousePassthrough = (event: MouseEvent) => {
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
  const agentMode = activeConversation?.mode === "agent";
  const messages = activeConversation?.messages ?? [];
  const displayName = activePet?.displayName ?? "哈基Mi";
  const animationOverride = useMemo(() => (status === "idle" ? undefined : status), [status]);

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

  async function sendMessage(content: string) {
    if (!state || !activeConversation || !content.trim()) {
      return;
    }
    markInteraction();
    if (agentMode && !state.settings.agent.workspaceDir) {
      setError("先在管理页或快速设置里选择一个办公区。");
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: content.trim() };
    const conversationId = activeConversation.id;
    const modeForRequest: PetConversationMode = agentMode ? "agent" : "chat";
    const optimisticSettings = appendConversationMessages(
      state.settings,
      conversationId,
      [userMessage],
      modeForRequest
    );
    setState({ ...state, settings: optimisticSettings });
    setStatus(agentMode ? "running" : "waiting");
    setError(undefined);
    busyRef.current = true;

    try {
      const requestMessages = [...activeConversation.messages, userMessage];
      const response = agentMode
        ? await window.petApp.runAgentTask(content.trim())
        : await window.petApp.sendChat(requestMessages);
      await persistSettings(
        appendConversationMessages(optimisticSettings, conversationId, [response], modeForRequest)
      );
      busyRef.current = false;
      showBubble(response.content, "info");
      setStatus("waving");
      window.setTimeout(() => setStatus("idle"), 900);
    } catch (err) {
      busyRef.current = false;
      setStatus("failed");
      setError(readErrorMessage(err));
      showBubble(readErrorMessage(err), "info");
      window.setTimeout(() => setStatus("idle"), 1200);
    }
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

  async function setConversationMode(enabled: boolean) {
    if (!state || !activeConversation) {
      return;
    }
    markInteraction();
    await persistSettings(updateConversationMode(state.settings, activeConversation.id, enabled ? "agent" : "chat"));
  }

  function openChat() {
    markInteraction();
    setBubble(undefined);
    setChatOpen(true);
  }

  function openAgentChat() {
    markInteraction();
    void setConversationMode(true);
    setBubble(undefined);
    setChatOpen(true);
  }

  function showBubble(text: string, tone: BubbleState["tone"], slotId?: GreetingSlotId) {
    const compact = text.length > 82 ? `${text.slice(0, 82)}...` : text;
    setBubble({ text: compact, tone });
    if (slotId === "afterWork") {
      setStatus("waving");
      window.setTimeout(() => setStatus("idle"), 1000);
    }
  }

  function markInteraction() {
    lastInteractionRef.current = Date.now();
  }

  function playPetAction(animation: AnimationState, duration = 900) {
    markInteraction();
    setStatus(animation);
    window.setTimeout(() => setStatus("idle"), duration);
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
        onTestModel={(model) => window.petApp.testModel(model)}
        onCheckUpdates={() => window.petApp.checkUpdates()}
        onCheckNotices={() => window.petApp.checkNotices()}
        onSave={saveSettings}
        chatError={error}
        onCreateConversation={createNewConversation}
        onSwitchConversation={switchConversation}
        onDeleteConversation={removeConversation}
        onRenameConversation={renameConversationTitle}
        onSendMessage={sendMessage}
      />
    );
  }

  return (
    <main className="app-shell">
      {chatOpen && (
        <ChatPanel
          displayName={displayName}
          conversations={state.settings.conversations}
          activeConversationId={activeConversation.id}
          messages={messages}
          error={error}
          agentMode={agentMode}
          onToggleAgentMode={setConversationMode}
          onCreateConversation={createNewConversation}
          onSwitchConversation={switchConversation}
          onDeleteConversation={removeConversation}
          onSend={sendMessage}
          onClose={() => {
            markInteraction();
            setChatOpen(false);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          state={state}
          onClose={() => setSettingsOpen(false)}
          onImport={async () => setState(await window.petApp.importPet())}
          onSwitchPet={async (petId) => setState(await window.petApp.switchPet(petId))}
          onChooseWorkspace={chooseWorkspace}
          onSave={saveSettings}
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
        hoverActions={[
          {
            label: "聊天",
            icon: <MessageCircle size={16} />,
            onSelect: openChat
          },
          {
            label: "办公",
            icon: <BriefcaseBusiness size={16} />,
            onSelect: openAgentChat
          },
          {
            label: "跳一下",
            icon: <ArrowUp size={16} />,
            onSelect: () => playPetAction("jumping", 850)
          },
          {
            label: "挥手",
            icon: <Sparkles size={16} />,
            onSelect: () => playPetAction("waving", 900)
          },
          {
            label: "设置",
            icon: <Settings size={16} />,
            onSelect: () => {
              markInteraction();
              setSettingsOpen((open) => !open);
            }
          }
        ]}
      />
    </main>
  );
}

function withActiveConversation(state: PetAppState): PetAppState {
  return { ...state, settings: ensureActiveConversation(state.settings) };
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
