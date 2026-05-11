import { MoreHorizontal, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ChatMessage } from "../../electron/chatClient";
import type { PetConversation, PetConversationMode } from "../../electron/settingsStore";
import { fileToMessageContent } from "../lib/fileMessage";

type Props = {
  displayName: string;
  conversations: PetConversation[];
  activeConversationId: string;
  bindingLabel: string;
  messages: ChatMessage[];
  error?: string;
  agentMode: boolean;
  onCreateConversation(mode: PetConversationMode): void | Promise<void>;
  onSwitchConversation(conversationId: string): void | Promise<void>;
  onDeleteConversation(conversationId: string): void | Promise<void>;
  onSend(content: string): void | Promise<void>;
  onClose(): void;
};

export default function ChatPanel({
  displayName,
  conversations,
  activeConversationId,
  bindingLabel,
  messages,
  error,
  agentMode,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onSend,
  onClose
}: Props) {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages.length, error]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }
    void onSend(draft);
    setDraft("");
  }

  async function sendFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await onSend(await fileToMessageContent(file));
  }

  function runMenuAction(action: () => void | Promise<void>) {
    setMenuOpen(false);
    void action();
  }

  return (
    <section className="chat-panel">
      <header>
        <div className="chat-title-block">
          <strong>{displayName}</strong>
          <span className="chat-binding-label">{bindingLabel}</span>
        </div>
        <div className="chat-header-actions">
          <div className="chat-overflow" ref={menuRef}>
            <button
              className="chat-panel-menu-button"
              type="button"
              title="更多会话操作"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="chat-overflow-menu">
                <button type="button" onClick={() => runMenuAction(() => onCreateConversation("chat"))}>
                  <Plus size={14} />
                  <span>新建会话</span>
                </button>
                <button
                  type="button"
                  disabled={conversations.length <= 1}
                  onClick={() => runMenuAction(() => onDeleteConversation(activeConversationId))}
                >
                  <Trash2 size={14} />
                  <span>删除会话</span>
                </button>
              </div>
            )}
          </div>
          <button title="关闭" type="button" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="conversation-bar">
        <select
          value={activeConversationId}
          title="选择会话"
          onChange={(event) => void onSwitchConversation(event.target.value)}
        >
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
      </div>

      <div className="message-list" ref={messageListRef}>
        {messages.length === 0 && (
          <p className="muted">{agentMode ? "让哈基Mi处理当前办公区里的事。" : "喵？"}</p>
        )}
        {messages.map((message, index) => (
          <div className={message.role === "user" ? "message user" : "message assistant"} key={index}>
            {message.role === "assistant" && message.durationMs !== undefined && (
              <span className="message-meta">{formatProcessingTime(message.durationMs)}</span>
            )}
            <span>{message.content}</span>
          </div>
        ))}
        {error && <p className="message error">{error}</p>}
      </div>
      <form onSubmit={submit}>
        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          onChange={(event) => void sendFile(event)}
        />
        <input
          value={draft}
          placeholder={agentMode ? "例如：看看 README 并帮我改成新版说明" : ""}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="chat-file-button" title="发送文件" type="button" onClick={() => fileInputRef.current?.click()}>
          <Paperclip size={16} />
        </button>
        <button className="chat-send-button" title="发送" type="submit" disabled={!draft.trim()}>
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}

function formatProcessingTime(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `已处理 ${seconds}s`;
  }
  return `已处理 ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
