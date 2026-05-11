import { readPetAction, type PetAction } from "../src/lib/petActions.js";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  durationMs?: number;
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
  durationMs?: number;
  petActions?: PetAction[];
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

  const endpoint = buildOpenAIChatCompletionsEndpoint(settings.baseUrl);
  const petBodyPrompt =
    "You are not only a text assistant: you are the visible HaJiMi desktop pet with a body on the user's screen. " +
    "When the user asks you to move, jump, run, go left/right/corner, speak from a bubble, change mood, play by yourself, or calm down, use the control_pet tool so your desktop pet body acts. " +
    "Use mood=review while reading or reviewing work, mood=waiting while waiting for a result, mood=working for focused office mode, and mood=failed when something is blocked.";
  const requestMessages = [
    { role: "system" as const, content: [settings.systemPrompt.trim(), petBodyPrompt].filter(Boolean).join("\n") },
    ...messages
  ];

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      messages: requestMessages,
      tools: PET_ACTION_TOOLS,
      tool_choice: "auto"
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
  const petActions = readAssistantPetActions(data);
  if (!content && petActions.length === 0) {
    throw new ChatClientError("malformed-response", "Chat provider returned an invalid response.");
  }

  return { role: "assistant", content: content || "好的。", petActions: petActions.length ? petActions : undefined };
}

export function buildOpenAIChatCompletionsEndpoint(baseUrl: string): string {
  try {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path.endsWith("/chat/completions")) {
      url.pathname = path;
      return url.toString();
    }
    url.pathname = path.endsWith("/v1")
      ? `${path}/chat/completions`
      : `${path === "" ? "" : path}/v1/chat/completions`;
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
  const content = first?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  const parts = content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      const typed = part as { text?: unknown; content?: unknown };
      if (typeof typed.text === "string") {
        return typed.text;
      }
      if (typeof typed.content === "string") {
        return typed.content;
      }
      return "";
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

function readAssistantPetActions(data: unknown): PetAction[] {
  if (!data || typeof data !== "object") {
    return [];
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return [];
  }
  const message = (choices[0] as { message?: { tool_calls?: unknown; function_call?: unknown } } | undefined)?.message;
  const toolCalls = message?.tool_calls;
  const calls = Array.isArray(toolCalls)
    ? toolCalls
    : message?.function_call
      ? [message.function_call]
      : [];

  return calls
    .map((toolCall) => readToolCallPetAction(toolCall))
    .filter((action): action is PetAction => Boolean(action));
}

function readToolCallPetAction(toolCall: unknown): PetAction | undefined {
  if (!toolCall || typeof toolCall !== "object") {
    return undefined;
  }
  const typed = toolCall as {
    name?: unknown;
    arguments?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };
  const name = typed.function?.name ?? typed.name;
  const args = typed.function?.arguments ?? typed.arguments;
  if (name !== "control_pet") {
    return undefined;
  }
  if (args && typeof args === "object") {
    return readPetAction(args);
  }
  if (typeof args !== "string") {
    return undefined;
  }
  try {
    return readPetAction(JSON.parse(args));
  } catch {
    return undefined;
  }
}

const PET_ACTION_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_pet",
      description: "Control your visible HaJiMi desktop pet body when the user asks you to move, jump, run, speak, go to a screen edge/corner, change mood, play by yourself, review work, wait for a result, or calm down.",
      parameters: {
        type: "object",
        oneOf: [
          {
            properties: {
              type: { const: "say" },
              text: { type: "string", minLength: 1, maxLength: 140 }
            },
            required: ["type", "text"]
          },
          {
            properties: {
              type: { enum: ["jump", "openChat", "stopMovement"] }
            },
            required: ["type"]
          },
          {
            properties: {
              type: { const: "moveTo" },
              x: { type: "number" },
              y: { type: "number" }
            },
            required: ["type", "x", "y"]
          },
          {
            properties: {
              type: { const: "moveToEdge" },
              edge: { enum: ["left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight", "center"] }
            },
            required: ["type", "edge"]
          },
          {
            properties: {
              type: { const: "runAround" },
              seconds: { type: "number", minimum: 1, maximum: 30 }
            },
            required: ["type"]
          },
          {
            properties: {
              type: { const: "setMovement" },
              enabled: { type: "boolean" },
              intensity: { enum: ["calm", "normal", "lively"] }
            },
            required: ["type", "enabled"]
          },
          {
            properties: {
              type: { const: "mood" },
              mood: { enum: ["idle", "happy", "working", "waiting", "review", "failed"] }
            },
            required: ["type", "mood"]
          }
        ]
      }
    }
  }
];
