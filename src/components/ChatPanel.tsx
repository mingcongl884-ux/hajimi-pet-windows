import { BriefcaseBusiness, MessageCircle, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ChatMessage } from "../../electron/chatClient";
import type { PetConversation, PetConversationMode } from "../../electron/settingsStore";
import { fileToMessageContent } from "../lib/fileMessage";

type Props = {
  displayName: string;
  conversations: PetConversation[];
  activeConversationId: string;
  messages: ChatMessage[];
  error?: string;
  agentMode: boolean;
  onToggleAgentMode(enabled: boolean): void | Promise<void>;
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
  messages,
  error,
  agentMode,
  onToggleAgentMode,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onSend,
  onClose
}: Props) {
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <section className="chat-panel">
      <header>
        <strong>{displayName}</strong>
        <div className="chat-header-actions">
          <button
            className={agentMode ? "chat-mode-toggle active" : "chat-mode-toggle"}
            title={agentMode ? "切回聊天" : "办公模式"}
            onClick={() => void onToggleAgentMode(!agentMode)}
          >
            {agentMode ? <BriefcaseBusiness size={15} /> : <MessageCircle size={15} />}
          </button>
          <button title="关闭" onClick={onClose}>
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
        <button title="新建聊天会话" onClick={() => void onCreateConversation("chat")}>
          <Plus size={14} />
        </button>
        <button title="新建办公会话" onClick={() => void onCreateConversation("agent")}>
          <BriefcaseBusiness size={14} />
        </button>
        <button
          title="删除当前会话"
          disabled={conversations.length <= 1}
          onClick={() => void onDeleteConversation(activeConversationId)}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="message-list">
        {messages.length === 0 && (
          <p className="muted">{agentMode ? "让哈基Mi处理当前办公区里的事。" : "喵？"}</p>
        )}
        {messages.map((message, index) => (
          <p className={message.role === "user" ? "message user" : "message assistant"} key={index}>
            {message.content}
          </p>
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
        <button title="发送文件" type="button" onClick={() => fileInputRef.current?.click()}>
          <Paperclip size={16} />
        </button>
        <button title="发送" type="submit">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
