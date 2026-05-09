export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatApiSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
};

export type ChatResponse = {
  role: "assistant";
  content: string;
};

export class ChatClientError extends Error {
  constructor(
    public readonly code:
      | "missing-api-key"
      | "invalid-base-url"
      | "provider-error"
      | "malformed-response",
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ChatClientError";
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  text?: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export async function sendChatMessage(
  fetchImpl: FetchLike,
  settings: ChatApiSettings,
  messages: ChatMessage[]
): Promise<ChatResponse> {
  if (!settings.apiKey.trim()) {
    throw new ChatClientError("missing-api-key", "API key is required.");
  }

  const endpoint = buildEndpoint(settings.baseUrl);
  const requestMessages = settings.systemPrompt.trim()
    ? [{ role: "system" as const, content: settings.systemPrompt.trim() }, ...messages]
    : messages;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      messages: requestMessages
    })
  });

  if (!response.ok) {
    throw new ChatClientError(
      "provider-error",
      response.statusText || "Chat provider returned an error.",
      response.status
    );
  }

  const data = await response.json();
  const content = readAssistantContent(data);
  if (!content) {
    throw new ChatClientError("malformed-response", "Chat provider returned an invalid response.");
  }

  return { role: "assistant", content };
}

function buildEndpoint(baseUrl: string): string {
  try {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    const url = new URL(`${trimmed}/v1/chat/completions`);
    return url.toString();
  } catch {
    throw new ChatClientError("invalid-base-url", "API base URL is invalid.");
  }
}

function readAssistantContent(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content : undefined;
}
