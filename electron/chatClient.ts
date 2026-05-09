import { readPetAction, type PetAction } from "../src/lib/petActions.js";

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

function readAssistantPetActions(data: unknown): PetAction[] {
  if (!data || typeof data !== "object") {
    return [];
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return [];
  }
  const message = (choices[0] as { message?: { tool_calls?: unknown } } | undefined)?.message;
  const toolCalls = message?.tool_calls;
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls
    .map((toolCall) => readToolCallPetAction(toolCall))
    .filter((action): action is PetAction => Boolean(action));
}

function readToolCallPetAction(toolCall: unknown): PetAction | undefined {
  if (!toolCall || typeof toolCall !== "object") {
    return undefined;
  }
  const typed = toolCall as { function?: { name?: unknown; arguments?: unknown } };
  if (typed.function?.name !== "control_pet" || typeof typed.function.arguments !== "string") {
    return undefined;
  }
  try {
    return readPetAction(JSON.parse(typed.function.arguments));
  } catch {
    return undefined;
  }
}

const PET_ACTION_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_pet",
      description: "Safely control the HaJiMi desktop pet when the user asks the pet to move, jump, speak, or change mood.",
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
              type: { const: "runAround" },
              seconds: { type: "number", minimum: 1, maximum: 30 }
            },
            required: ["type"]
          },
          {
            properties: {
              type: { const: "mood" },
              mood: { enum: ["idle", "happy", "working", "failed"] }
            },
            required: ["type", "mood"]
          }
        ]
      }
    }
  }
];
