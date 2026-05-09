import type { ChatMessage } from "../../electron/chatClient.js";
import type { AppSettings, PetConversation, PetConversationMode } from "../../electron/settingsStore.js";

const DEFAULT_CONVERSATION_ID = "default";
const TITLE_LIMIT = 15;

export function ensureActiveConversation(settings: AppSettings, now = new Date().toISOString()): AppSettings {
  const projectId = settings.activeProjectId || "";
  const projectConversations = settings.conversations.filter((conversation) => (conversation.projectId || "") === projectId);
  if (projectConversations.length > 0) {
    const activeConversation = settings.conversations.find(
      (conversation) => conversation.id === settings.activeConversationId && (conversation.projectId || "") === projectId
    );
    return activeConversation
      ? settings
      : { ...settings, activeConversationId: projectConversations[0].id };
  }

  return {
    ...settings,
    activeConversationId: defaultConversationId(projectId),
    conversations: [
      ...settings.conversations,
      {
        id: defaultConversationId(projectId),
        title: "新会话",
        mode: "chat",
        projectId: projectId || undefined,
        messages: [],
        updatedAt: now
      }
    ]
  };
}

export function createConversation(
  settings: AppSettings,
  mode: PetConversationMode,
  now = new Date().toISOString(),
  id = makeConversationId()
): AppSettings {
  const prepared = ensureActiveConversation(settings, now);
  const projectId = prepared.activeProjectId || "";
  const projectConversationCount = prepared.conversations.filter(
    (conversation) => (conversation.projectId || "") === projectId
  ).length;
  const conversation: PetConversation = {
    id,
    title: `${mode === "agent" ? "办公会话" : "聊天会话"} ${projectConversationCount + 1}`,
    mode,
    projectId: projectId || undefined,
    messages: [],
    updatedAt: now
  };

  return {
    ...prepared,
    activeConversationId: id,
    conversations: [...prepared.conversations, conversation]
  };
}

export function appendConversationMessages(
  settings: AppSettings,
  conversationId: string,
  messages: ChatMessage[],
  mode: PetConversationMode,
  now = new Date().toISOString()
): AppSettings {
  const prepared = ensureActiveConversation(settings, now);
  return {
    ...prepared,
    activeConversationId: conversationId,
    conversations: prepared.conversations.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }

      const nextMessages = [...conversation.messages, ...messages];
      return {
        ...conversation,
        mode,
        messages: nextMessages,
        title: conversation.messages.length === 0 ? titleFromMessages(nextMessages) : conversation.title,
        updatedAt: now
      };
    })
  };
}

export function deleteConversation(
  settings: AppSettings,
  conversationId: string,
  now = new Date().toISOString()
): AppSettings {
  const deleted = settings.conversations.find((conversation) => conversation.id === conversationId);
  const projectId = deleted?.projectId || settings.activeProjectId || "";
  const remaining = settings.conversations.filter((conversation) => conversation.id !== conversationId);
  const remainingInProject = remaining.filter((conversation) => (conversation.projectId || "") === projectId);
  if (remainingInProject.length === 0) {
    return ensureActiveConversation({ ...settings, activeConversationId: "", conversations: remaining }, now);
  }

  return {
    ...settings,
    activeConversationId:
      settings.activeConversationId === conversationId ? remainingInProject[0].id : settings.activeConversationId,
    conversations: remaining
  };
}

export function renameConversation(
  settings: AppSettings,
  conversationId: string,
  title: string,
  now = new Date().toISOString()
): AppSettings {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return settings;
  }

  return {
    ...settings,
    conversations: settings.conversations.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, title: nextTitle, updatedAt: now }
        : conversation
    )
  };
}

export function updateConversationMode(
  settings: AppSettings,
  conversationId: string,
  mode: PetConversationMode,
  now = new Date().toISOString()
): AppSettings {
  return {
    ...settings,
    activeConversationId: conversationId,
    conversations: settings.conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, mode, updatedAt: now } : conversation
    )
  };
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) {
    return "新会话";
  }
  return firstUserMessage.length > TITLE_LIMIT
    ? `${firstUserMessage.slice(0, TITLE_LIMIT)}...`
    : firstUserMessage;
}

function makeConversationId(): string {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultConversationId(projectId: string): string {
  return projectId ? `${DEFAULT_CONVERSATION_ID}-${projectId}` : DEFAULT_CONVERSATION_ID;
}
