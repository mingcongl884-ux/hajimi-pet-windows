import { Copy, MoreHorizontal, Paperclip, Pencil, Plus, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import type { ChatMessage } from "../../electron/chatClient";
import type { PetConversation } from "../../electron/settingsStore";
import { buildAttachmentMessage, fileToPromptAttachment, type PromptAttachment } from "../lib/fileMessage";

type Props = {
  displayName: string;
  bindingLabel: string;
  conversations: PetConversation[];
  activeConversationId: string;
  messages: ChatMessage[];
  error?: string;
  sending: boolean;
  onCreateConversation(): void | Promise<void>;
  onSwitchConversation(conversationId: string): void | Promise<void>;
  onDeleteConversation(conversationId: string): void | Promise<void>;
  onSend(message: ChatMessage): void | Promise<void>;
  onCancel(): void | Promise<void>;
  onClose(): void;
};

export default function PetChatBubble({
  displayName,
  bindingLabel,
  conversations,
  activeConversationId,
  messages,
  error,
  sending,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  onSend,
  onCancel,
  onClose
}: Props) {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PromptAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages.length, error, sending]);

  useEffect(() => {
    draftInputRef.current?.focus();
  }, []);

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
    if (sending || (!draft.trim() && pendingAttachments.length === 0)) {
      return;
    }

    const message = pendingAttachments.length
      ? buildAttachmentMessage(draft, pendingAttachments)
      : { role: "user" as const, content: draft.trim() };
    setDraft("");
    setPendingAttachments([]);
    void Promise.resolve(onSend(message)).catch(() => undefined);
  }

  async function sendFile(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    await addFiles(files);
  }

  async function addFiles(fileList: FileList | File[] | null | undefined) {
    const files = Array.from(fileList ?? []);
    if (!files.length) {
      return;
    }

    const nextAttachments = await Promise.all(files.map((file) => fileToPromptAttachment(file)));
    setPendingAttachments((current) => [...current, ...nextAttachments]);
    requestAnimationFrame(() => draftInputRef.current?.focus());
  }

  function removeAttachment(id: string) {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length) {
      return;
    }
    event.preventDefault();
    setDragActive(false);
    await addFiles(event.dataTransfer.files);
  }

  function runMenuAction(action: () => void | Promise<void>) {
    setMenuOpen(false);
    void action();
  }

  async function copyMessage(message: ChatMessage) {
    await writeClipboard(message.displayContent ?? message.content);
  }

  function editMessage(message: ChatMessage) {
    setDraft(message.displayContent ?? message.content);
    requestAnimationFrame(() => draftInputRef.current?.focus());
  }

  return (
    <section
      className={dragActive ? "pet-chat-bubble composer-drop-active" : "pet-chat-bubble"}
      data-scope="current office conversation"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="pet-chat-header">
        <div>
          <strong>{displayName}</strong>
          <span>{bindingLabel}</span>
        </div>
        <div className="pet-chat-actions">
          <div className="pet-chat-overflow" ref={menuRef}>
            <button type="button" title="更多" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="pet-chat-overflow-menu">
                <button type="button" onClick={() => runMenuAction(onCreateConversation)}>
                  <Plus size={14} />
                  <span>新建办公会话</span>
                </button>
                <button
                  type="button"
                  disabled={conversations.length <= 1}
                  onClick={() => runMenuAction(() => onDeleteConversation(activeConversationId))}
                >
                  <Trash2 size={14} />
                  <span>删除当前会话</span>
                </button>
              </div>
            )}
          </div>
          <button type="button" title="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </header>

      <select
        className="pet-chat-select"
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

      <div className="pet-chat-messages" ref={messageListRef}>
        {messages.length === 0 && <p className="pet-chat-empty">让哈基Mi处理当前办公区里的事。</p>}
        {messages.map((message, index) => (
          <div className={message.role === "user" ? "pet-chat-message user" : "pet-chat-message assistant"} key={index}>
            {message.role === "assistant" && message.durationMs !== undefined && (
              <span className="pet-chat-meta">{formatProcessingTime(message.durationMs)}</span>
            )}
            <span>{message.displayContent ?? message.content}</span>
            {message.fileOutputs?.length ? (
              <div className="composer-output-files">
                {message.fileOutputs.map((file) => (
                  <span className="composer-output-file" key={`${file.path}-${file.size ?? 0}`} title={file.path}>
                    <Paperclip size={12} />
                    <span>{file.name || file.path}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="message-action-row">
              <button type="button" title="复制" onClick={() => void copyMessage(message)}>
                <Copy size={13} />
              </button>
              <button type="button" title="编辑" onClick={() => editMessage(message)}>
                <Pencil size={13} />
              </button>
            </div>
          </div>
        ))}
        {sending && <p className="pet-chat-processing">处理中...</p>}
        {error && <p className="pet-chat-error">{error}</p>}
      </div>

      <form className="pet-chat-form" onSubmit={submit}>
        {pendingAttachments.length > 0 && (
          <div className="composer-attachments">
            {pendingAttachments.map((attachment) => (
              <span className="composer-attachment" key={attachment.id}>
                <Paperclip size={12} />
                <span>{attachment.name}</span>
                <button type="button" title="移除附件" onClick={() => removeAttachment(attachment.id)}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="pet-chat-input-row">
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            multiple
            onChange={(event) => void sendFile(event)}
          />
          <input
            ref={draftInputRef}
            value={draft}
            disabled={sending}
            placeholder="例如：看看 README 并帮我改成新版说明"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" title="添加文件" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={16} />
          </button>
          <button
            className={sending ? "pet-chat-send stop" : "pet-chat-send"}
            type={sending ? "button" : "submit"}
            title={sending ? "停止" : "发送"}
            disabled={!sending && !draft.trim() && pendingAttachments.length === 0}
            onClick={sending ? () => void onCancel() : undefined}
          >
            {sending ? <Square size={13} /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </section>
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const element = document.createElement("textarea");
  element.value = text;
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();
  document.execCommand("copy");
  element.remove();
}

function formatProcessingTime(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `已处理 ${seconds}s`;
  }
  return `已处理 ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
