import type { ChatMessage, ChatResponse } from "./chatClient.js";
import type { AppSettings } from "./settingsStore.js";
import type { ChannelPeer } from "../src/lib/channels.js";
import { appendConversationMessages, ensureActiveConversation } from "../src/lib/conversations.js";
import { routeChannelMessage, type ChannelMessage, type ChannelRouteDecision } from "../src/lib/channelRouter.js";

export type ChannelBridgeRequest = {
  conversationId: string;
  text: string;
  messages: ChatMessage[];
  settings: AppSettings;
  decision: Extract<ChannelRouteDecision, { type: "route" }>;
};

export type ChannelBridgeResponder = (request: ChannelBridgeRequest) => Promise<ChatResponse>;

export type ChannelBridgeResult = {
  settings: AppSettings;
  decision: ChannelRouteDecision;
  reply?: string;
  response?: ChatResponse;
};

export async function handleInboundChannelMessage(
  settings: AppSettings,
  message: ChannelMessage,
  responder: ChannelBridgeResponder
): Promise<ChannelBridgeResult> {
  const prepared = ensureActiveConversation(settings, message.receivedAt);
  const decision = routeChannelMessage(prepared, message);
  if (decision.type !== "route") {
    return { settings: prepared, decision, reply: decision.reply };
  }

  const pairedSettings = decision.peerToAllow
    ? addAllowedPeer(prepared, decision.peerToAllow)
    : prepared;
  const conversation = pairedSettings.conversations.find((item) => item.id === decision.conversationId);
  const userMessage: ChatMessage = { role: "user", content: decision.text.trim() };
  const requestMessages = [...(conversation?.messages ?? []), userMessage];
  const withUserMessage = appendConversationMessages(
    pairedSettings,
    decision.conversationId,
    [userMessage],
    decision.mode,
    message.receivedAt
  );
  const response = await responder({
    conversationId: decision.conversationId,
    text: decision.text,
    messages: requestMessages,
    settings: withUserMessage,
    decision
  });
  const nextSettings = appendConversationMessages(
    withUserMessage,
    decision.conversationId,
    [{ role: "assistant", content: response.content }],
    decision.mode,
    new Date().toISOString()
  );

  return { settings: nextSettings, decision, reply: response.content, response };
}

function addAllowedPeer(settings: AppSettings, peer: ChannelPeer): AppSettings {
  return {
    ...settings,
    channels: settings.channels.map((channel) => {
      if (channel.provider !== peer.channel) {
        return channel;
      }
      if (channel.allowedPeers.some((item) => item.channel === peer.channel && item.kind === peer.kind && item.id === peer.id)) {
        return channel;
      }
      return {
        ...channel,
        allowedPeers: [...channel.allowedPeers, peer]
      };
    })
  };
}
